import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { rankArticles, type NewsHeadline, type RankableArticle } from "../lib/newsRanking";

const router = Router();

// Re-exported for existing importers; ranking/scoring now lives in lib/newsRanking.
export type Headline = NewsHeadline;

interface CacheEntry {
  fetchedAt: number;
  headlines: NewsHeadline[];
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchFromGNews(
  company: string,
  industry: string,
  role: string,
): Promise<NewsHeadline[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) throw new Error("GNEWS_API_KEY is not set");

  // GNews searches titles and descriptions — quoted phrase guarantees the
  // company name appears in the article headline or summary (not buried in body).
  const q = `"${company}"`;
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=10&token=${apiKey}`;
  console.log(`[news] GNews fetch: q=${q}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  console.log(`[news] GNews response: status=${response.status} content-type=${response.headers.get("content-type")}`);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[news] GNews non-OK body: ${body.slice(0, 300)}`);
    throw new Error(`GNews responded with HTTP ${response.status}: ${body.slice(0, 120)}`);
  }

  const data = await response.json() as {
    totalArticles?: number;
    articles?: RankableArticle[];
    errors?: string[];
  };

  const raw = (data.articles ?? []).filter((a) => a.title && a.url);
  console.log(`[news] GNews totalArticles=${data.totalArticles ?? "?"} returned=${raw.length}`);

  const { selected, all } = rankArticles(raw, { company, industry, role });

  console.log(`[news] Score breakdown for "${company}" (industry="${industry}" role="${role}"):`);
  for (const { breakdown, duplicateOf } of all) {
    console.log(
      `[news]  [${breakdown.tier.toUpperCase()}] score=${breakdown.score} ` +
        `inTitle=${breakdown.companyInTitle} inBody=${breakdown.companyInBody} ` +
        `cap=${breakdown.capitalizationSignal} ` +
        `nearby=[${breakdown.contextTermsNearby.join(",")}] ` +
        `industry=[${breakdown.industryTermsFound.join(",")}] ` +
        `junk=[${breakdown.junkTermsFound.join(",")}] ` +
        `${duplicateOf ? "DUP " : ""}` +
        `"${breakdown.title.slice(0, 80)}"`,
    );
  }

  console.log(`[news] Qualified: ${selected.length}/${raw.length} for "${company}"`);

  return selected.map(({ article }) => ({
    title: article.title ?? "",
    source: article.source?.name ?? "",
    publishedAt: article.publishedAt ?? "",
    url: article.url ?? "",
    description: article.description ?? undefined,
  }));
}

router.get("/company-news", requireAuth, async (req, res) => {
  const company = (req.query["company"] as string | undefined)?.trim();
  const industry = ((req.query["industry"] as string | undefined) ?? "").trim();
  const role = ((req.query["role"] as string | undefined) ?? "").trim();

  if (!company) {
    res.status(400).json({ error: "Missing company query parameter" });
    return;
  }

  const cacheKey = `${company}|${industry}|${role}`.toLowerCase();
  const cached = cache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    res.json({ company, headlines: cached.headlines, fetchedAt: cached.fetchedAt, fromCache: true });
    return;
  }

  try {
    const headlines = await fetchFromGNews(company, industry, role);
    cache.set(cacheKey, { fetchedAt: now, headlines });
    res.json({ company, headlines, fetchedAt: now, fromCache: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isAbort = message.includes("abort") || message.includes("AbortError");
    const isConfigMissing = message.includes("GNEWS_API_KEY is not set");
    console.error(`[news] error for "${company}": ${message}`);

    // A missing API key is a configuration problem, not transient — never mask
    // it with stale cache, and classify it distinctly for the UI.
    if (isConfigMissing) {
      res.json({
        company,
        headlines: [],
        fetchedAt: now,
        fromCache: false,
        error: "config_missing",
        detail: "Company news is not configured (GNEWS_API_KEY is not set).",
      });
      return;
    }

    if (cached) {
      res.json({ company, headlines: cached.headlines, fetchedAt: cached.fetchedAt, fromCache: true, stale: true });
      return;
    }

    res.json({
      company,
      headlines: [],
      fetchedAt: now,
      fromCache: false,
      error: isAbort ? "timeout" : "fetch_failed",
      detail: message,
    });
  }
});

export default router;
