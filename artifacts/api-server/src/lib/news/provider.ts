// ============================================================================
// The news provider boundary.
//
// Everything above this file — caching, deduplication, ranking — is provider
// agnostic. A provider's only job is: given a company name, return recent
// articles, or throw. It knows nothing about caching, users or contacts.
//
// This exists so the provider can be swapped without touching the expensive
// part (the cache). GNews is the only implementation today and remains the
// active one; adding another is a new object satisfying `NewsProvider`, not
// edits to the route.
//
// Deliberately small. No registry, no plugin loader, no DI container — one
// interface and one factory function, which is all the abstraction the
// problem actually has.
// ============================================================================
import type { RankableArticle } from "../newsRanking";

/** Distinguishes a provider refusing us from a provider being broken. */
export class NewsProviderError extends Error {
  constructor(
    message: string,
    /** true when the provider is up but rejected us: quota, bad key, 4xx.
     *  Retrying immediately will not help. */
    readonly permanent: boolean,
    /** Provider-side status, when there was one. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "NewsProviderError";
  }
}

export interface NewsProvider {
  /** Stored on the cache row so we can tell which provider produced a result
   *  after a switch, and invalidate selectively if we ever need to. */
  readonly name: string;
  /** False when the provider has no credentials configured. */
  isConfigured(): boolean;
  /**
   * Recent articles mentioning `company`. Returns raw, UNRANKED articles —
   * ranking is per-contact and happens after the cache, so that one cached
   * company result can serve contacts with different industries and roles.
   */
  searchCompanyNews(company: string, signal: AbortSignal): Promise<RankableArticle[]>;
}

/** How many raw articles to ask a provider for. Ranking discards most of
 *  them; asking for more costs nothing extra (providers bill per REQUEST,
 *  not per article) and gives the ranker more to choose from. 10 is also the
 *  cap on GNews' cheapest tiers. */
export const PROVIDER_ARTICLE_LIMIT = 10;

const GNEWS_TIMEOUT_MS = 8000;

class GNewsProvider implements NewsProvider {
  readonly name = "gnews";

  isConfigured(): boolean {
    return !!process.env["GNEWS_API_KEY"];
  }

  async searchCompanyNews(company: string, signal: AbortSignal): Promise<RankableArticle[]> {
    const apiKey = process.env["GNEWS_API_KEY"];
    if (!apiKey) throw new NewsProviderError("GNEWS_API_KEY is not set", true);

    // Quoted phrase: GNews searches titles and descriptions, so quoting keeps
    // the company name in the headline or summary rather than buried in body
    // text. The ranker still filters hard afterwards.
    const q = `"${company}"`;
    const url =
      `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}` +
      `&lang=en&max=${PROVIDER_ARTICLE_LIMIT}&token=${apiKey}`;

    const res = await fetch(url, { signal });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 401/403 are key or quota problems; 429 is rate limiting. None of
      // these get better by retrying in the next second.
      const permanent = res.status === 401 || res.status === 403 || res.status === 429;
      throw new NewsProviderError(
        `GNews HTTP ${res.status}: ${body.slice(0, 120)}`,
        permanent,
        res.status,
      );
    }

    const data = (await res.json()) as { articles?: RankableArticle[] };
    return (data.articles ?? []).filter((a) => a.title && a.url);
  }
}

const gnews = new GNewsProvider();

/** The provider in use. GNews until a replacement is approved. */
export function activeNewsProvider(): NewsProvider {
  return gnews;
}

/** Timeout budget for one provider call. */
export function providerTimeoutMs(): number {
  return GNEWS_TIMEOUT_MS;
}
