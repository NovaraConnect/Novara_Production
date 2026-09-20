// ============================================================================
// Shared, persistent company-news cache.
//
// WHAT THIS REPLACED, AND WHY
// ---------------------------
// The old cache was a module-level `Map` keyed on `company|industry|role`.
// Two problems, both of which cost real money at the provider:
//
//   1. It died with the process. Every deploy dropped it, so the next few
//      minutes of traffic re-fetched every company from scratch.
//   2. Industry and role were part of the KEY. Two users who both know
//      someone at Revolut produced two separate provider searches if one had
//      tagged the contact "Fintech/Product" and the other had left it blank —
//      for byte-identical company news.
//
// Now: one row per normalised company, in Postgres, shared by every user and
// surviving deploys. Industry and role are applied AFTER the cache, when
// ranking, so personalisation is preserved without fragmenting the lookup.
//
// THE TABLE MAY NOT EXIST YET. This repo applies migrations by hand, so code
// can reach production before `0003_company_news_cache.sql` is run. Every
// database call here is wrapped: if the table is missing the cache simply
// reports a miss and the route still works, just without persistence. That
// makes the deploy order irrelevant — which is the point.
//
// NOTHING HERE THROWS AT THE CALLER. A broken cache must degrade to "no
// cached news", never to a failed contact screen.
// ============================================================================
import { pool } from "../../db";
import { logger } from "../logger";
import type { RankableArticle } from "../newsRanking";
import {
  activeNewsProvider,
  providerTimeoutMs,
  NewsProviderError,
} from "./provider";

/** Company news is not breaking news. A day old is fine for a conversation
 *  opener, and every hour added here is a proportional cut in provider spend. */
export const FRESH_TTL_MS = 24 * 60 * 60 * 1000;

/** How long a stale row may still be served when the provider is failing.
 *  Week-old news beats an empty panel during an outage; beyond that it starts
 *  to look like a bug rather than a cache. */
export const STALE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** Rows untouched for this long are deleted opportunistically. */
const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** Roughly 1 write in 50 also prunes, which keeps the table tidy without a
 *  scheduled job or a second moving part. */
const PRUNE_PROBABILITY = 0.02;

export interface CachedCompanyNews {
  articles: RankableArticle[];
  fetchedAt: number;
  /** True when served past its TTL because the provider could not be reached. */
  stale: boolean;
  /** True when no provider request was made to satisfy this call. */
  cached: boolean;
}

export type NewsLookupOutcome =
  | { kind: "hit"; value: CachedCompanyNews }
  | { kind: "stale"; value: CachedCompanyNews; reason: string }
  | { kind: "empty"; reason: "config_missing" | "timeout" | "fetch_failed" };

// ---------------------------------------------------------------------------
// Table presence
//
// Checked once, then re-checked at most once a minute while missing, so the
// cache starts working on its own after the migration is applied — no
// redeploy, no restart.
// ---------------------------------------------------------------------------
let tableExists: boolean | null = null;
let tableCheckedAt = 0;
const TABLE_RECHECK_MS = 60_000;

async function cacheTableAvailable(): Promise<boolean> {
  const now = Date.now();
  if (tableExists === true) return true;
  if (tableExists === false && now - tableCheckedAt < TABLE_RECHECK_MS) return false;

  tableCheckedAt = now;
  try {
    const { rows } = await pool.query<{ exists: boolean }>(
      "SELECT to_regclass('public.company_news_cache') IS NOT NULL AS exists",
    );
    tableExists = rows[0]?.exists ?? false;
    if (!tableExists) {
      logger.warn(
        "company_news_cache table is missing — news works but is not cached. " +
          "Apply migrations/0003_company_news_cache.sql.",
      );
    }
  } catch (err) {
    tableExists = false;
    logger.warn({ err }, "could not check for company_news_cache");
  }
  return tableExists;
}

// ---------------------------------------------------------------------------
// L1: a small in-process cache in front of Postgres.
//
// Two jobs. It saves a database round trip on repeated views of the same
// company, and — more importantly — it means this code is never WORSE than
// what it replaced. Until migrations/0003 is applied the table does not
// exist, and without this layer a deploy would briefly leave news entirely
// uncached and push more traffic at the provider, not less. With it, the
// pre-migration behaviour matches the old in-memory Map.
//
// BOUNDED, unlike the Map it replaces, which grew without limit for the life
// of the process. Oldest entry is evicted first (JS Maps keep insertion
// order), so memory is capped no matter how many companies are seen.
// ---------------------------------------------------------------------------
const L1_MAX_ENTRIES = 500;
const l1 = new Map<string, { articles: RankableArticle[]; fetchedAt: number }>();

function l1Get(key: string): { articles: RankableArticle[]; fetchedAt: number } | null {
  const hit = l1.get(key);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt >= FRESH_TTL_MS) {
    l1.delete(key);
    return null;
  }
  return hit;
}

function l1Set(key: string, articles: RankableArticle[], fetchedAt: number): void {
  if (l1.size >= L1_MAX_ENTRIES && !l1.has(key)) {
    const oldest = l1.keys().next().value;
    if (oldest !== undefined) l1.delete(oldest);
  }
  l1.set(key, { articles, fetchedAt });
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------
interface CacheRow {
  articles: RankableArticle[];
  fetched_at: Date;
  expires_at: Date;
}

async function readRow(companyKey: string): Promise<CacheRow | null> {
  if (!(await cacheTableAvailable())) return null;
  try {
    const { rows } = await pool.query<CacheRow>(
      `SELECT articles, fetched_at, expires_at
         FROM company_news_cache WHERE company_key = $1`,
      [companyKey],
    );
    return rows[0] ?? null;
  } catch (err) {
    logger.warn({ err, companyKey }, "company news cache read failed");
    return null;
  }
}

async function writeRow(
  companyKey: string,
  displayName: string,
  provider: string,
  articles: RankableArticle[],
): Promise<void> {
  if (!(await cacheTableAvailable())) return;
  const now = new Date();
  const expires = new Date(now.getTime() + FRESH_TTL_MS);
  try {
    await pool.query(
      `INSERT INTO company_news_cache
         (company_key, display_company, provider, articles, fetched_at, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (company_key) DO UPDATE SET
         display_company = EXCLUDED.display_company,
         provider        = EXCLUDED.provider,
         articles        = EXCLUDED.articles,
         fetched_at      = EXCLUDED.fetched_at,
         expires_at      = EXCLUDED.expires_at`,
      [companyKey, displayName, provider, JSON.stringify(articles), now, expires],
    );
  } catch (err) {
    // A cache we cannot write is a slower cache, not a broken feature.
    logger.warn({ err, companyKey }, "company news cache write failed");
    return;
  }

  if (Math.random() < PRUNE_PROBABILITY) {
    pool
      .query("DELETE FROM company_news_cache WHERE fetched_at < $1", [
        new Date(Date.now() - PRUNE_AFTER_MS),
      ])
      .catch((err: unknown) => logger.warn({ err }, "company news cache prune failed"));
  }
}

// ---------------------------------------------------------------------------
// In-flight de-duplication
//
// Opening a contact list with twenty Microsoft contacts used to mean twenty
// provider calls racing each other, all of them writing the same row. Callers
// now share one promise per company, so the twenty-first caller during a
// fetch waits on the first caller's request rather than starting its own.
//
// Process-local on purpose. Render runs a single instance; a cross-instance
// lock would be a distributed system built to save a handful of requests.
// ---------------------------------------------------------------------------
const inFlight = new Map<string, Promise<RankableArticle[]>>();

function fetchOnce(companyKey: string, displayName: string): Promise<RankableArticle[]> {
  const existing = inFlight.get(companyKey);
  if (existing) return existing;

  const provider = activeNewsProvider();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), providerTimeoutMs());

  const run = provider
    .searchCompanyNews(displayName, controller.signal)
    .then(async (articles) => {
      l1Set(companyKey, articles, Date.now());
      await writeRow(companyKey, displayName, provider.name, articles);
      return articles;
    })
    .finally(() => {
      clearTimeout(timer);
      inFlight.delete(companyKey);
    });

  inFlight.set(companyKey, run);
  return run;
}

// ---------------------------------------------------------------------------
// The one entry point
// ---------------------------------------------------------------------------

/**
 * Raw articles for a company: cached when possible, fetched when not, stale
 * when the provider is unavailable, empty when all else fails.
 *
 * Never throws. Never returns ranked results — ranking is the caller's job,
 * because it depends on the contact and the cache must not.
 */
export async function getCompanyArticles(
  companyKey: string,
  displayName: string,
): Promise<NewsLookupOutcome> {
  const provider = activeNewsProvider();

  const warm = l1Get(companyKey);
  if (warm) {
    return {
      kind: "hit",
      value: { articles: warm.articles, fetchedAt: warm.fetchedAt, stale: false, cached: true },
    };
  }

  const row = await readRow(companyKey);
  const now = Date.now();

  if (row && row.expires_at.getTime() > now) {
    l1Set(companyKey, row.articles, row.fetched_at.getTime());
    return {
      kind: "hit",
      value: {
        articles: row.articles,
        fetchedAt: row.fetched_at.getTime(),
        stale: false,
        cached: true,
      },
    };
  }

  // A missing key is configuration, not a transient fault. Say so plainly
  // rather than dressing it up as stale data.
  if (!provider.isConfigured()) {
    return { kind: "empty", reason: "config_missing" };
  }

  try {
    const articles = await fetchOnce(companyKey, displayName);
    return {
      kind: "hit",
      value: { articles, fetchedAt: Date.now(), stale: false, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const aborted =
      (err instanceof Error && err.name === "AbortError") || message.includes("abort");

    if (err instanceof NewsProviderError && err.permanent && !provider.isConfigured()) {
      return { kind: "empty", reason: "config_missing" };
    }

    // Expired but recent enough to still be worth showing.
    if (row && now - row.fetched_at.getTime() < STALE_GRACE_MS) {
      logger.warn({ companyKey, message }, "serving stale company news");
      return {
        kind: "stale",
        value: {
          articles: row.articles,
          fetchedAt: row.fetched_at.getTime(),
          stale: true,
          cached: true,
        },
        reason: message,
      };
    }

    logger.warn({ companyKey, message }, "company news unavailable");
    return { kind: "empty", reason: aborted ? "timeout" : "fetch_failed" };
  }
}

/** Test seam: forget in-flight requests and the table-presence check. */
export function __resetNewsCacheState(): void {
  inFlight.clear();
  l1.clear();
  tableExists = null;
  tableCheckedAt = 0;
}
