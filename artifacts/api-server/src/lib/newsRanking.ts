// ============================================================================
// Deterministic ranking + de-duplication for company news ("Conversation
// Starters"). No AI / no network — pure functions over article text so the
// behaviour is cheap, explainable and unit-testable with fixtures.
//
// Goals (see also tests/news.test.ts):
//   • Collapse syndicated near-duplicate stories to a single card
//     (normalized-title similarity, not just exact URL).
//   • Prefer genuine company/business news over celebrity-shopping, product
//     affiliate, coupon/deal and lifestyle-fluff content.
//   • Show fewer (or zero) cards when quality is low, rather than padding the
//     section with weak duplicates.
// ============================================================================

export type CapSignal = "proper" | "lowercase" | "none";
export type Tier = "high" | "medium" | "low" | "discard";

export interface RankableArticle {
  title?: string | null;
  description?: string | null;
  content?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  source?: { name?: string | null } | null;
}

export interface RankContext {
  company: string;
  industry?: string;
  role?: string;
}

export interface NewsHeadline {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  description?: string;
}

export interface ScoreBreakdown {
  title: string;
  companyInTitle: boolean;
  companyInBody: boolean;
  capitalizationSignal: CapSignal;
  contextTermsFound: string[];
  contextTermsNearby: string[];
  industryMatch: boolean;
  industryTermsFound: string[];
  junkTermsFound: string[];
  junkDominated: boolean;
  tier: Tier;
  score: number;
}

export interface RankedArticle {
  article: RankableArticle;
  breakdown: ScoreBreakdown;
  /** URL of the higher-ranked article this one was merged into (near-duplicate). */
  duplicateOf?: string;
}

// Business/newsworthy signals — a company name sitting near these reads as a
// real company story rather than an incidental brand mention.
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

// High-signal newsworthy terms — the subset of CONTEXT_TERMS that reliably
// marks a real company story. Generic words ("product", "service", "company",
// "round" as in "round-up", "app", …) are deliberately excluded: they appear in
// shopping and lifestyle copy too, so they must not, on their own, elevate an
// article to a top tier or rescue it from the junk gate.
const STRONG_CONTEXT = new Set([
  "ceo", "cto", "cfo", "coo", "founder", "cofounder", "president", "chairman", "director",
  "announced", "announces", "launched", "launches", "launch",
  "funding", "funded", "fundraise", "fundraising", "raised", "raise", "series",
  "acquired", "acquisition", "acquires", "merger", "merged",
  "revenue", "profit", "earnings", "growth", "sales",
  "hired", "hiring", "appointment", "appointed", "joins",
  "partnership", "partners", "collaboration", "collaborates",
  "ipo", "nasdaq", "nyse", "valuation",
  "investors", "investment", "backed", "venture",
  "layoffs", "expansion",
  "deal", "agreement", "contract", "signed", "milestone",
]);

// Shopping / affiliate / coupon / celebrity-lifestyle signals. Business words
// that also appear in shopping copy (e.g. "deal", "sales") are intentionally
// NOT here — they live in CONTEXT_TERMS. A price pattern (£24, $30, 40%) is
// counted separately, see PRICE_RE.
const JUNK_TERMS = new Set([
  // shopping / affiliate / coupon
  "shop", "shopping", "buy", "discount", "discounts", "voucher", "vouchers",
  "coupon", "coupons", "promo", "bargain", "cheap", "cheapest", "bestselling",
  "affiliate", "cart", "checkout", "restock", "dupe", "dupes", "shoppers",
  "snap", "nab", "sale", "clearance", "wishlist",
  // celebrity / lifestyle fluff
  "swears", "swear", "obsessed", "viral", "tiktok", "raves", "raved",
  "wrinkle", "wrinkles", "ageless", "flawless", "fans", "celeb", "gorgeous",
]);

// Generic industry/role tokens that must NOT count as an "industry match" —
// they match almost anything (a shopping piece says "product", a "Product
// Manager" contact injects "product"/"management") and falsely boost fluff.
const GENERIC_INDUSTRY_STOPWORDS = new Set([
  "product", "products", "management", "manager", "personal", "care",
  "services", "service", "business", "company", "industry", "general",
  "team", "group", "market", "markets", "sector", "brand", "brands",
]);

// Stop-words removed before comparing titles for near-duplicate similarity.
const TITLE_STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "these", "those", "are", "was",
  "were", "been", "from", "after", "over", "into", "your", "you", "our", "their",
  "his", "her", "she", "they", "says", "say", "said", "new", "how", "why",
  "what", "best", "top", "just", "has", "have", "had", "will", "can", "get",
  "gets", "got", "off", "out", "who",
]);

const PRICE_RE = /[£$€]\s?\d[\d.,]*|\b\d[\d.,]*\s?%/g;

export function tokenize(text: string): string[] {
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
  const industryWords = tokenize(`${industry} ${role}`)
    .filter((w) => w.length > 3 && !GENERIC_INDUSTRY_STOPWORDS.has(w));
  const textWords = new Set(tokenize(text));
  return [...new Set(industryWords.filter((w) => textWords.has(w)))];
}

function findJunkTerms(text: string, companyLower: string): string[] {
  const companyTokens = new Set(tokenize(companyLower));
  const found = new Set<string>();
  for (const w of tokenize(text)) {
    // Don't penalise a junk-listed word when it is actually the company name
    // (e.g. a contact whose company literally is a shopping brand).
    if (JUNK_TERMS.has(w) && !companyTokens.has(w)) found.add(w);
  }
  if (PRICE_RE.test(text)) found.add("$price");
  PRICE_RE.lastIndex = 0; // reset stateful global regex
  return [...found];
}

export function scoreArticle(article: RankableArticle, ctx: RankContext): ScoreBreakdown {
  const companyLower = ctx.company.toLowerCase();
  const industry = (ctx.industry ?? "").trim();
  const role = (ctx.role ?? "").trim();

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

  // Only *strong* newsworthy terms near the company count as real business
  // context — generic words like "product"/"round" must not rescue fluff.
  const nearbyStrong = nearbyTerms.filter((t) => STRONG_CONTEXT.has(t));
  const hasStrongContext = nearbyStrong.length > 0;

  const junkTermsFound = findJunkTerms(fullText, companyLower);
  // "Celebrity shopping / affiliate / coupon" fluff: multiple junk signals and
  // no strong business context near the company. A substantive company story
  // (proper-noun name next to real context terms) has hasStrongContext = true,
  // so this can't misfire on the articles we actually want to show.
  const junkDominated = junkTermsFound.length >= 2 && !hasStrongContext;

  let score = 0;
  if (companyInTitle) score += 3;
  if (companyInBody) score += 1;
  if (capSignal === "proper") score += 2;
  if (capSignal === "lowercase") score -= 2;
  score += Math.min(nearbyTerms.length, 3);
  if (industryMatch) score += 2;
  score -= junkTermsFound.length; // down-rank shopping/celebrity noise

  let tier: Tier;

  if (junkDominated) {
    // Product/affiliate/celebrity-shopping content without business substance.
    tier = "discard";
  } else if (
    (companyInTitle || companyInBody) &&
    !hasStrongContext &&
    !industryMatch &&
    capSignal === "lowercase"
  ) {
    tier = "discard";
  } else if (companyInTitle && hasStrongContext && capSignal === "proper") {
    tier = "high";
  } else if (companyInTitle && capSignal === "proper") {
    tier = "medium";
  } else if (companyInTitle && hasStrongContext) {
    tier = "medium";
  } else if (companyInBody && hasStrongContext && (!hasIndustry || industryMatch)) {
    tier = "medium";
  } else if (hasStrongContext && (companyInTitle || companyInBody)) {
    tier = "low";
  } else if ((companyInTitle || companyInBody) && industryMatch && junkTermsFound.length === 0) {
    // Company mentioned + on-topic industry term + no shopping noise.
    tier = "low";
  } else {
    // Company present but no business context, no clean industry match, or
    // carrying shopping noise → not a strong conversation starter.
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
    junkTermsFound,
    junkDominated,
    tier,
    score,
  };
}

// ── De-duplication ──────────────────────────────────────────────────────────

/** Significant, price-stripped, stop-word-stripped title tokens. */
export function normalizeTitleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(PRICE_RE, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !TITLE_STOPWORDS.has(w));
}

/**
 * Overlap coefficient over significant title tokens: |A∩B| / min(|A|,|B|).
 * Robust to syndication where outlets add/trim a few words around the same
 * distinctive noun phrase ("Cat Deeley … eye bag cream").
 */
export function titleSimilarity(a: string, b: string): number {
  const A = new Set(normalizeTitleTokens(a));
  const B = new Set(normalizeTitleTokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

// Overlap-coefficient bar for "same story". Kept moderate (0.5) so heavily
// paraphrased syndication ("Cat Deeley's £24 cream …" vs "… £24 eye cream Cat
// Deeley swears by") still collapses; the ≥2-shared-significant-tokens guard
// stops short, unrelated headlines from being merged on a single common word.
const DUP_SIMILARITY_THRESHOLD = 0.5;
const DUP_MIN_SHARED_TOKENS = 2;

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function isNearDuplicate(a: string, b: string): boolean {
  const A = new Set(normalizeTitleTokens(a));
  const B = new Set(normalizeTitleTokens(b));
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  if (inter < DUP_MIN_SHARED_TOKENS) return false;
  const minSize = Math.min(A.size, B.size);
  return minSize > 0 && inter / minSize >= DUP_SIMILARITY_THRESHOLD;
}

const TIER_ORDER: Record<Tier, number> = { high: 3, medium: 2, low: 1, discard: 0 };

function publishedMs(a: RankableArticle): number {
  const t = a.publishedAt ? Date.parse(a.publishedAt) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export interface RankResult {
  /** Deduped, quality-gated, ordered, capped list of what to show. */
  selected: RankedArticle[];
  /** Every candidate with its breakdown + duplicate info (for logging). */
  all: RankedArticle[];
}

/**
 * Full pipeline: score → order (tier, score, recency) → drop discards →
 * collapse exact-URL and near-duplicate titles → cap. Returns fewer (or zero)
 * items when nothing clears the quality bar.
 */
export function rankArticles(
  articles: RankableArticle[],
  ctx: RankContext,
  maxResults = 3,
): RankResult {
  const scored: RankedArticle[] = articles
    .filter((a) => a.title && a.url)
    .map((article) => ({ article, breakdown: scoreArticle(article, ctx) }));

  const ordered = [...scored].sort((x, y) => {
    const tierDiff = TIER_ORDER[y.breakdown.tier] - TIER_ORDER[x.breakdown.tier];
    if (tierDiff !== 0) return tierDiff;
    if (y.breakdown.score !== x.breakdown.score) return y.breakdown.score - x.breakdown.score;
    return publishedMs(y.article) - publishedMs(x.article);
  });

  const kept: RankedArticle[] = [];
  const keptUrls = new Set<string>();

  for (const cand of ordered) {
    if (cand.breakdown.tier === "discard") continue;

    const url = normalizeUrl(cand.article.url ?? "");
    if (keptUrls.has(url)) {
      cand.duplicateOf = url;
      continue;
    }
    const dupOf = kept.find((k) => isNearDuplicate(k.breakdown.title, cand.breakdown.title));
    if (dupOf) {
      cand.duplicateOf = dupOf.article.url ?? undefined;
      continue;
    }

    kept.push(cand);
    keptUrls.add(url);
    if (kept.length >= maxResults) break;
  }

  return { selected: kept, all: ordered };
}

export function toHeadline(article: RankableArticle): NewsHeadline {
  return {
    title: article.title ?? "",
    source: article.source?.name ?? "",
    publishedAt: article.publishedAt ?? "",
    url: article.url ?? "",
    description: article.description ?? undefined,
  };
}

/** Convenience wrapper returning just the headlines to render. */
export function selectHeadlines(
  articles: RankableArticle[],
  ctx: RankContext,
  maxResults = 3,
): NewsHeadline[] {
  return rankArticles(articles, ctx, maxResults).selected.map(({ article }) => toHeadline(article));
}
