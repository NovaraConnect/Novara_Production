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

describe("a company name that is also an everyday word", () => {
  const STRIPE: RankContext = { company: "Stripe", industry: "Fintech", role: "Engineer" };

  // Real articles GNews returned for "Stripe" on 27 Oct 2026.
  const football = art("Two more Ohio State football players loses black stripe: Buckeye Talk", {
    description: "Favour Akih and Nick Lautar became the latest Ohio State newcomers to earn their black stripe removals, marking a milestone for both players early in the 2025 season.",
    source: "cleveland.com",
  });
  const basketball = art("Angel Reese’s Blunt Response to Referee Goes Viral Before Dream Star Makes Her Point on the Court", {
    description: "After a missed foul call from the referee, Angel Reese does not dwell on it and subsequently receives two shots from the charity stripe.",
  });
  const monitor = art("5 game-changing features that make the Alienware 39 gaming monitor a Black Friday deal worth chasing", {
    description: "Alienware's world-first 39-inch 5K RGB stripe tandem OLED is the ultrawide display of your dreams",
  });
  const meta = art("Meta had to ask Stripe to raise limits as Muse shoppers poured in", {
    description: "More than 10 million people have set up Meta’s Muse, and Meta had to ask Stripe to raise credit limits.",
  });
  const microsoft = art("Microsoft nominates Stripe’s Collison to its board and trims Nadella’s pay", {
    description: "Microsoft names Stripe’s John Collison to its board slate as two directors leave.",
  });

  it("drops stories that only use the word, even next to a business word", () => {
    expect(scoreArticle(football, STRIPE).tier).toBe("discard");
    expect(scoreArticle(basketball, STRIPE).tier).toBe("discard");
    expect(scoreArticle(monitor, STRIPE).tier).toBe("discard");
  });

  it("keeps real Stripe news", () => {
    const shown = selectHeadlines([football, basketball, monitor, meta, microsoft], STRIPE).map((h) => h.title);
    expect(shown).toContain(meta.title);
    expect(shown).toContain(microsoft.title);
    expect(shown).not.toContain(football.title);
    expect(shown).not.toContain(monitor.title);
  });

  it("still counts a brand the user spells in lowercase", () => {
    const ebay = art("Sellers flock to the marketplace as eBay reports record quarterly revenue", {
      description: "The company said growth came from collectibles, and shares rose.",
    });
    expect(scoreArticle(ebay, { company: "eBay" }).tier).not.toBe("discard");
  });
});

describe("sport and investment-promo filler", () => {
  it("drops a sports story that only mentions the company as a sponsor", () => {
    const a = art("Alessia Russo reveals why she's backed game-changing initiative to boost grassroots women's football", {
      description: "The Arsenal forward is an ambassador for Starling Bank's 'Kick On' campaign, which aims to increase funding at grassroots level.",
    });
    expect(scoreArticle(a, { company: "Starling Bank" }).tier).toBe("discard");
  });

  it("keeps a sports deal when the company is the headline", () => {
    const a = art("Stripe signs multi-year partnership with the NBA", {
      description: "Stripe will process payments for the basketball league's online store under the agreement.",
    });
    expect(scoreArticle(a, { company: "Stripe" }).tier).not.toBe("discard");
  });

  it("drops 'best crypto to buy now' promotions", () => {
    const a = art("Best Crypto to Buy Now: Revolut's EEA Crypto Migration Puts Remittix, TAO and Solana in the Adoption Debate", {
      description: "Revolut is migrating EEA crypto customers to its CySEC-licensed digital asset entity.",
    });
    expect(scoreArticle(a, { company: "Revolut" }).tier).toBe("discard");
  });

  it("keeps news about a company's chairman", () => {
    const a = art("Former Goldman Sachs chief Sherwood leaves Britain as tax hike fears mount", {
      description: "A former Goldman Sachs chief who heads the board of Revolut, Europe's most valuable company, has relocated abroad.",
    });
    expect(scoreArticle(a, { company: "Revolut", industry: "Fintech" }).tier).not.toBe("discard");
  });
});

describe("news sources", () => {
  const story = (url: string) =>
    art("Revolut acquires Argentine bank to expand in Latin America", {
      description: "Revolut has agreed to buy Banco Cetelem Argentina, its first acquisition in the region.",
      url,
    });

  it("drops articles from blocked sites however relevant they look", () => {
    const b = scoreArticle(story("https://www.prnewswire.com/news/revolut-licence"), { company: "Revolut" });
    expect(b.tier).toBe("discard");
    expect(b.unsuitableSignals).toContain("source:prnewswire.com");
  });

  it("recognises trusted outlets on their subdomains", () => {
    expect(scoreArticle(story("https://markets.businessinsider.com/news/x"), { company: "Revolut" }).trustedSource).toBe(true);
    expect(scoreArticle(story("https://notbusinessinsider.com/news/x"), { company: "Revolut" }).trustedSource).toBe(false);
  });

  it("puts the trusted outlet first when two sites cover the same kind of story", () => {
    const local = art("Revolut launches mortgages for UK customers", {
      description: "Revolut has launched a mortgage product.",
      url: "https://www.bristolpost.co.uk/news/revolut-mortgages",
      publishedAt: "2026-08-21T10:00:00Z",
    });
    const reuters = art("Revolut hires former Barclays executive to run lending", {
      description: "Revolut appointed a new head of lending.",
      url: "https://www.reuters.com/business/revolut-lending",
      publishedAt: "2026-08-19T10:00:00Z",
    });
    const { selected } = rankArticles([local, reuters], { company: "Revolut" });
    expect(selected[0].article.url).toContain("reuters.com");
  });

  it("drops passenger-incident stories about an airline", () => {
    const a = art("Duct-taped passenger reveals what he drank before outburst on plane", {
      description: "A man was duct-taped and zip-tied by fellow passengers after a disruptive outburst on an early September American Airlines flight.",
      content: "A Tucson man says two screwdrivers explain a mid-flight meltdown that got him zip-tied and criminally charged.",
      url: "https://www.pennlive.com/news/duct-taped-passenger",
    });
    expect(scoreArticle(a, { company: "American Airlines", industry: "aviation" }).tier).toBe("discard");
  });

  it("still shows relevant news from sites on neither list", () => {
    const b = scoreArticle(story("https://www.bristolpost.co.uk/news/revolut"), { company: "Revolut" });
    expect(b.tier).not.toBe("discard");
  });
});
