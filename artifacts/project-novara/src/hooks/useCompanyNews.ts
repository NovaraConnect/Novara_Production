import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { apiFetch } from "@/lib/api";

export interface Headline {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  description?: string;
}

interface NewsCache {
  fetchedAt: number;
  headlines: Headline[];
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MEM_CACHE = new Map<string, NewsCache>(); // in-memory across re-renders

function makeCacheKey(company: string, industry?: string | null, role?: string | null) {
  const c = company.toLowerCase().replace(/\s+/g, "_");
  const i = (industry ?? "").toLowerCase().replace(/\s+/g, "_");
  const r = (role ?? "").toLowerCase().replace(/\s+/g, "_");
  return `novara_news_${c}__${i}__${r}`;
}

function readLocalCache(key: string): NewsCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as NewsCache;
  } catch {
    return null;
  }
}

function writeLocalCache(key: string, data: NewsCache) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // storage full or unavailable — ignore
  }
}

function isFresh(entry: NewsCache) {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

// Distinct UI states — a backend failure must never be collapsed into "empty"
// ("No recent company news found"). "empty" means the fetch succeeded and there
// genuinely were no relevant articles.
export type NewsStatus =
  | "idle"
  | "loading"
  | "ok"            // headlines found
  | "empty"         // confirmed: fetch succeeded, no relevant articles
  | "error"         // request/fetch failed
  | "config-missing" // GNEWS_API_KEY not configured on the backend
  | "timeout"       // upstream timed out
  | "stale"         // showing cached results after a refresh failure
  | "no-company";

interface CompanyNewsResponse {
  headlines?: Headline[];
  fetchedAt?: number;
  fromCache?: boolean;
  stale?: boolean;
  error?: "config_missing" | "timeout" | "fetch_failed" | string;
  detail?: string;
}

export function useCompanyNews(
  company: string | undefined | null,
  industry?: string | null,
  role?: string | null,
) {
  const { getToken } = useAuth();
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [status, setStatus] = useState<NewsStatus>("idle");
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!company?.trim()) {
      setStatus("no-company");
      setHeadlines([]);
      return;
    }

    const companyKey = company.trim();
    const cacheKey = makeCacheKey(companyKey, industry, role);

    // Check in-memory cache first (fastest, no serialization)
    const mem = MEM_CACHE.get(cacheKey);
    if (mem && isFresh(mem)) {
      setHeadlines(mem.headlines);
      setFetchedAt(mem.fetchedAt);
      setStatus(mem.headlines.length > 0 ? "ok" : "empty");
      return;
    }

    // Check localStorage cache
    const local = readLocalCache(cacheKey);
    if (local && isFresh(local)) {
      MEM_CACHE.set(cacheKey, local);
      setHeadlines(local.headlines);
      setFetchedAt(local.fetchedAt);
      setStatus(local.headlines.length > 0 ? "ok" : "empty");
      return;
    }

    // Fetch fresh
    setStatus("loading");
    let cancelled = false;

    const params = new URLSearchParams({ company: companyKey });
    if (industry?.trim()) params.set("industry", industry.trim());
    if (role?.trim()) params.set("role", role.trim());

    apiFetch(getToken, `/api/company-news?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<CompanyNewsResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setDetail(data.detail ?? null);

        // Preserve and act on the backend diagnostics rather than discarding them.
        if (data.error === "config_missing") {
          setHeadlines([]);
          setFetchedAt(data.fetchedAt ?? null);
          setStatus("config-missing");
          return;
        }
        if (data.error === "timeout") {
          setStatus("timeout");
          if (local) { setHeadlines(local.headlines); setFetchedAt(local.fetchedAt); }
          return;
        }
        if (data.error) {
          // fetch_failed or any other backend error.
          setStatus("error");
          if (local) { setHeadlines(local.headlines); setFetchedAt(local.fetchedAt); }
          return;
        }

        const list = data.headlines ?? [];
        const fa = data.fetchedAt ?? Date.now();

        if (data.stale) {
          // Backend served cached results after a refresh failure.
          setHeadlines(list);
          setFetchedAt(fa);
          setStatus("stale");
          return;
        }

        const entry: NewsCache = { fetchedAt: fa, headlines: list };
        MEM_CACHE.set(cacheKey, entry);
        writeLocalCache(cacheKey, entry);
        setHeadlines(list);
        setFetchedAt(fa);
        setStatus(list.length > 0 ? "ok" : "empty");
      })
      .catch(() => {
        if (cancelled) return;
        // Network/transport failure. Show stale data if we have it, clearly
        // marked as stale; otherwise surface the error (never "empty").
        if (local) {
          setHeadlines(local.headlines);
          setFetchedAt(local.fetchedAt);
          setStatus("stale");
        } else {
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [company, getToken, industry, role]);

  return { headlines, status, fetchedAt, detail };
}
