import { describe, it, expect } from "vitest";
import {
  rankArticles,
  selectHeadlines,
  scoreArticle,
  titleSimilarity,
  normalizeTitleTokens,
  type RankableArticle,
  type RankContext,
} from "../src/lib/newsRanking";

// Helper to build a GNews-shaped article quickly.
function art(
  title: string,
  opts: Partial<RankableArticle> & { source?: string } = {},
): RankableArticle {
  return {
    title,
    description: opts.description ?? "",
    content: opts.content ?? "",
    url: opts.url ?? `https://example.com/${encodeURIComponent(title).slice(0, 40)}`,
    publishedAt: opts.publishedAt ?? "2026-08-20T10:00:00Z",
    source: { name: opts.source ?? "Example News" },
  };
}

const LOREAL: RankContext = {
  company: "L'Oréal",
  industry: "beauty, cosmetics, personal care",
  role: "Product Manager",
};

// The real-world regression: one syndicated celebrity-shopping story about a
// L'Oréal-branded eye cream, repeated by several outlets with slightly
// different headlines. These flooded the section with near-duplicate cards.
const CAT_DEELEY_DUPES: RankableArticle[] = [
  art("Cat Deeley's £24 L'Oréal tightening eye bag cream that shoppers are obsessed with", {
    url: "https://outlet-a.com/cat-deeley-eye-cream",
    description: "Fans say the cream erases eye bags. Shop the £24 buy before it sells out.",
    source: "Outlet A",
  }),
  art("Cat Deeley swears by this £24 L'Oréal eye cream that tightens eye bags", {
    url: "https://outlet-b.com/cat-deeley-cream",
    description: "The bestselling anti-ageing cream shoppers love. Buy it now on sale.",
    source: "Outlet B",
  }),
  art("Shoppers obsessed with Cat Deeley's £24 L'Oréal eye bag tightening cream", {
    url: "https://outlet-c.com/deeley-eye-bag-cream",
    description: "This viral L'Oréal cream is a must-have. Grab the discount today.",
    source: "Outlet C",
  }),
];

const LOREAL_BUSINESS = art("L'Oréal reports 11% sales growth and raises full-year revenue outlook", {
  url: "https://reuters.example/loreal-q2",
  description: "L'Oréal announced quarterly earnings, with revenue and profit ahead of forecasts.",
  source: "Reuters",
});

describe("title normalization + similarity", () => {
  it("strips prices and stop-words to significant tokens", () => {
    expect(normalizeTitleTokens("Cat Deeley's £24 tightening eye bag cream")).toEqual(
      expect.arrayContaining(["cat", "deeley", "tightening", "eye", "bag", "cream"]),
    );
    // Price token £24 is removed, stop-words gone.
    expect(normalizeTitleTokens("Cat Deeley's £24 tightening eye bag cream")).not.toContain("24");
  });

  it("scores syndicated near-duplicates as highly similar", () => {
    // Different outlets paraphrase the same story; overlap stays well above the
    // 0.5 de-duplication bar even with reworded headlines.
    const s = titleSimilarity(CAT_DEELEY_DUPES[0].title!, CAT_DEELEY_DUPES[1].title!);
    expect(s).toBeGreaterThanOrEqual(0.5);
  });

  it("scores genuinely different stories as dissimilar", () => {
    const s = titleSimilarity(
      "L'Oréal reports 11% sales growth and raises revenue outlook",
      "L'Oréal acquires Aesop in landmark luxury beauty deal",
    );
    expect(s).toBeLessThan(0.5);
  });
});

describe("de-duplication", () => {
  it("collapses near-duplicate business stories to a single card", () => {
    const dupes = [
      art("Acme Corp raises $50M Series B led by Sequoia", { url: "https://a.com/1", source: "A" }),
      art("Acme Corp raises $50M in Series B funding round", { url: "https://b.com/2", source: "B" }),
      art("Sequoia leads Acme Corp's $50M Series B funding", { url: "https://c.com/3", source: "C" }),
    ];
    const out = selectHeadlines(dupes, { company: "Acme Corp" });
    expect(out).toHaveLength(1);
  });

  it("collapses exact-duplicate URLs even if titles differ", () => {
    const dupes = [
      art("Acme Corp announces new CEO", { url: "https://x.com/acme?utm=1", source: "A" }),
      art("Breaking: Acme Corp names new chief executive", { url: "https://x.com/acme?utm=2", source: "B" }),
    ];
    // Same host + path, different query → treated as the same article.
    const out = selectHeadlines(dupes, { company: "Acme Corp" });
    expect(out).toHaveLength(1);
  });

  it("keeps genuinely distinct company stories", () => {
    const distinct = [
      art("L'Oréal reports record quarterly revenue growth", { url: "https://a.com/1", source: "A" }),
      art("L'Oréal acquires skincare startup in expansion deal", { url: "https://b.com/2", source: "B" }),
    ];
    const out = selectHeadlines(distinct, LOREAL);
    expect(out).toHaveLength(2);
  });
});

describe("junk / low-quality filtering", () => {
  it("discards celebrity-shopping product fluff (Cat Deeley eye cream)", () => {
    for (const a of CAT_DEELEY_DUPES) {
      expect(scoreArticle(a, LOREAL).tier).toBe("discard");
    }
  });

  it("L'Oréal + Cat Deeley scenario: only the real business story survives", () => {
    const out = selectHeadlines([...CAT_DEELEY_DUPES, LOREAL_BUSINESS], LOREAL);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://reuters.example/loreal-q2");
  });

  it("returns an empty list (graceful empty state) when only fluff is available", () => {
    const out = selectHeadlines(CAT_DEELEY_DUPES, LOREAL);
    expect(out).toEqual([]);
  });

  it("does not let the generic 'product' role token boost shopping fluff", () => {
    // "Product Manager" role must not create an industry match on the word
    // "product" in a shopping headline.
    const b = scoreArticle(
      art("Grab this must-have L'Oréal beauty product on sale for £15", {
        description: "Shoppers love this viral product. Buy the discount deal now.",
      }),
      LOREAL,
    );
    expect(b.industryTermsFound).not.toContain("product");
    expect(b.tier).toBe("discard");
  });
});

describe("business relevance is preferred + ordering", () => {
  it("ranks a substantive company story above a thin one", () => {
    const strong = art("L'Oréal announces acquisition and new CEO appointment", {
      url: "https://s.com/strong",
      description: "L'Oréal announced the acquisition; the company appointed a new CEO.",
    });
    const thin = art("A day in beauty: five L'Oréal shades we tried", {
      url: "https://t.com/thin",
      description: "A lifestyle round-up mentioning L'Oréal among others.",
    });
    const { selected } = rankArticles([thin, strong], LOREAL);
    expect(selected[0].article.url).toBe("https://s.com/strong");
  });

  it("keeps a real company mention with an on-topic industry term (no shopping noise)", () => {
    const out = selectHeadlines(
      [art("L'Oréal expands cosmetics manufacturing with new plant investment", {
        description: "The cosmetics group announced an investment in new facilities.",
      })],
      LOREAL,
    );
    expect(out).toHaveLength(1);
  });

  it("caps results at three even when many strong stories exist", () => {
    const many = [
      art("Acme Corp raises Series A funding round", { url: "https://1", description: "funding round announced" }),
      art("Acme Corp appoints new CFO amid expansion", { url: "https://2", description: "appointed new cfo" }),
      art("Acme Corp signs partnership with major retailer", { url: "https://3", description: "partnership signed" }),
      art("Acme Corp reports record revenue growth", { url: "https://4", description: "revenue growth earnings" }),
    ];
    expect(selectHeadlines(many, { company: "Acme Corp" })).toHaveLength(3);
  });
});
