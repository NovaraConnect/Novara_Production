import { Router } from "express";
import { requireAuth } from "../middlewares/auth";

const router = Router();

export interface Headline {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  description?: string;
}

type CapSignal = "proper" | "lowercase" | "none";
type Tier = "high" | "medium" | "low" | "discard";

interface ScoreBreakdown {
  title: string;
  companyInTitle: boolean;
  companyInBody: boolean;
  capitalizationSignal: CapSignal;
  contextTermsFound: string[];
  contextTermsNearby: string[];
  industryMatch: boolean;
  industryTermsFound: string[];
  tier: Tier;
  score: number;
}

const CONTEXT_TERMS = new Set([
  "ceo", "cto", "cfo", "coo", "founder", "cofounder", "president", "chairman", "director",
  "announced", "announces", "launched", "launches", "launch",
  "funding", "funded", "fundraise", "fundraising", "raised", "raise", "round", "series",
  "acquired", "acquisition", "acquires", "merger", "merged",
  "revenue", "profit", "earnings", "growth", "sales",
  "hired", "hiring", "appointment", "appointed", "joins",
  "partnership", "partners", "collaboration", "collaborates",
  "ipo", "shares", "stock", "nasdaq", "nyse", "valuation",
  "investors", "investment", "backed", "venture",
  "employees", "workforce", "headcount", "layoffs",
  "headquartered", "headquarters", "hq", "offices",
  "startup", "platform", "product", "service", "app",
  "deal", "agreement", "contract", "signed",
  "expansion", "strategy", "initiative", "milestone",
  "company", "firm", "corporation", "inc", "llc", "ltd", "corp",
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function findCapitalizationSignal(text: string, companyLower: string): CapSignal {
  const escaped = companyLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "gi");
  const matches = [...text.matchAll(regex)];
  if (matches.length === 0) return "none";

  let properCount = 0;
  let lowercaseCount = 0;

  for (const m of matches) {
    const matchedText = m[0];
    const idx = m.index ?? 0;
    const before = text.slice(Math.max(0, idx - 3), idx);
    const isSentenceStart = idx === 0 || /[.!?]\s+$/.test(before);

    if (!isSentenceStart) {
      if (matchedText[0] === matchedText[0].toUpperCase() && matchedText[0] !== matchedText[0].toLowerCase()) {
        properCount++;
      } else {
        lowercaseCount++;
      }
    }
  }

  if (properCount > 0) return "proper";
  if (lowercaseCount > 0 && properCount === 0) return "lowercase";
  return "none";
}

function findContextTermsInWindow(text: string, companyLower: string, windowSize = 10): string[] {
  const words = tokenize(text);
  const companyWords = tokenize(companyLower);
  const firstCompanyWord = companyWords[0];
  if (!firstCompanyWord) return [];

  const found = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    if (words[i] === firstCompanyWord) {
      const isFullMatch = companyWords.every((cw, offset) => words[i + offset] === cw);
      if (!isFullMatch) continue;
      const start = Math.max(0, i - windowSize);
      const end = Math.min(words.length, i + companyWords.length + windowSize);
      for (let j = start; j < end; j++) {
        if (CONTEXT_TERMS.has(words[j])) found.add(words[j]);
      }
    }
  }
  return [...found];
}

function findContextTermsAnywhere(text: string): string[] {
  const words = tokenize(text);
  return [...new Set(words.filter((w) => CONTEXT_TERMS.has(w)))];
}

function findIndustryTerms(text: string, industry: string, role: string): string[] {
  const industryWords = tokenize(`${industry} ${role}`).filter((w) => w.length > 3);
  const textWords = new Set(tokenize(text));
  return industryWords.filter((w) => textWords.has(w));
}

function scoreArticle(
  article: { title?: string | null; description?: string | null; content?: string | null },
  companyLower: string,
  industry: string,
  role: string,
): ScoreBreakdown {
  const titleText = (article.title ?? "").toLowerCase();
  const bodyText = [(article.description ?? ""), (article.content ?? "")].join(" ").toLowerCase();
  const fullText = `${article.title ?? ""} ${article.description ?? ""} ${article.content ?? ""}`;

  const companyInTitle = titleText.includes(companyLower);
  const companyInBody = bodyText.includes(companyLower);

  const capSignal = findCapitalizationSignal(fullText, companyLower);
  const nearbyTerms = findContextTermsInWindow(fullText, companyLower);
  const allTerms = findContextTermsAnywhere(fullText);

  const hasIndustry = (industry || role).trim().length > 0;
  const industryTermsFound = hasIndustry ? findIndustryTerms(fullText, industry, role) : [];
  const industryMatch = industryTermsFound.length > 0;

  let score = 0;
  if (companyInTitle) score += 3;
  if (companyInBody) score += 1;
  if (capSignal === "proper") score += 2;
  if (capSignal === "lowercase") score -= 2;
  score += Math.min(nearbyTerms.length, 3);
  if (industryMatch) score += 2;

  let tier: Tier;

  // Negative signal: company present but all signals negative → discard
  if (
    (companyInTitle || companyInBody) &&
    nearbyTerms.length === 0 &&
    !industryMatch &&
    capSignal === "lowercase"
  ) {
    tier = "discard";
  } else if (companyInTitle && nearbyTerms.length > 0 && capSignal === "proper") {
    tier = "high";
  } else if (companyInTitle && capSignal === "proper") {
    // Proper-noun company name in headline — reliable even without nearby terms
    tier = "medium";
  } else if (companyInTitle && nearbyTerms.length > 0) {
    tier = "medium";
  } else if (companyInBody && nearbyTerms.length > 0 && (!hasIndustry || industryMatch)) {
    tier = "medium";
  } else if (score >= 1 && (companyInTitle || companyInBody)) {
    tier = "low";
  } else {
    tier = "discard";
  }

  return {
    title: article.title ?? "",
    companyInTitle,
    companyInBody,
    capitalizationSignal: capSignal,
    contextTermsFound: allTerms,
    contextTermsNearby: nearbyTerms,
    industryMatch,
    industryTermsFound,
    tier,
    score,
  };
}

interface CacheEntry {
  fetchedAt: number;
  headlines: Headline[];
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface GNewsArticle {
  title?: string | null;
  description?: string | null;
  content?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  source?: { name?: string | null } | null;
}

async function fetchFromGNews(
  company: string,
  industry: string,
  role: string,
): Promise<Headline[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) throw new Error("GNEWS_API_KEY is not set");

  const companyLower = company.toLowerCase();

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
    articles?: GNewsArticle[];
    errors?: string[];
  };

  const raw = (data.articles ?? []).filter((a) => a.title && a.url);
  console.log(`[news] GNews totalArticles=${data.totalArticles ?? "?"} returned=${raw.length}`);

  // Score and log every candidate
  const scored = raw.map((a) => ({
    raw: a,
    breakdown: scoreArticle(a, companyLower, industry, role),
  }));

  console.log(`[news] Score breakdown for "${company}" (industry="${industry}" role="${role}"):`);
  for (const { breakdown } of scored) {
    console.log(
      `[news]  [${breakdown.tier.toUpperCase()}] score=${breakdown.score} ` +
        `inTitle=${breakdown.companyInTitle} inBody=${breakdown.companyInBody} ` +
        `cap=${breakdown.capitalizationSignal} ` +
        `nearby=[${breakdown.contextTermsNearby.join(",")}] ` +
        `industry=[${breakdown.industryTermsFound.join(",")}] ` +
        `"${breakdown.title.slice(0, 80)}"`,
    );
  }

  const TIER_ORDER: Record<Tier, number> = { high: 3, medium: 2, low: 1, discard: 0 };
  const qualified = scored
    .filter(({ breakdown }) => breakdown.tier !== "discard")
    .sort((a, b) => {
      const tierDiff = TIER_ORDER[b.breakdown.tier] - TIER_ORDER[a.breakdown.tier];
      return tierDiff !== 0 ? tierDiff : b.breakdown.score - a.breakdown.score;
    })
    .slice(0, 3);

  console.log(`[news] Qualified: ${qualified.length}/${raw.length} for "${company}"`);

  return qualified.map(({ raw: a }) => ({
    title: a.title!,
    source: a.source?.name ?? "",
    publishedAt: a.publishedAt ?? "",
    url: a.url!,
    description: a.description ?? undefined,
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
