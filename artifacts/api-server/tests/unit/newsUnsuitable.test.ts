import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { scoreArticle, selectHeadlines, type RankableArticle, type RankContext } from "../../src/lib/newsRanking";

const TESLA: RankContext = { company: "Tesla", industry: "automotive", role: "Product Manager" };

function art(title: string, description = ""): RankableArticle {
  return {
    title,
    description,
    content: "",
    url: `https://example.com/${encodeURIComponent(title).slice(0, 40)}`,
    publishedAt: "2026-09-16T10:00:00Z",
    source: { name: "Example News" },
  };
}

describe("news: unsuitable stories never become conversation starters", () => {
  // Both of these were live in Cloe's own feed, offered as ways to reconnect
  // with a recruiter at Tesla.
  it("discards a crime story that names the company", () => {
    const b = scoreArticle(
      art("Career criminal accused of stolen Tesla rampage that injured woman on San Diego freeway"),
      TESLA,
    );
    expect(b.tier).toBe("discard");
    expect(b.unsuitableSignals.length).toBeGreaterThan(0);
  });

  it("discards filler that only borrows the name", () => {
    const b = scoreArticle(
      art('Quote of the day by Nikola Tesla: "Life is and will ever remain an equation incapable of solution"'),
      TESLA,
    );
    expect(b.tier).toBe("discard");
    expect(b.unsuitableSignals).toContain("quote of the day");
  });

  it.each([
    "Two killed in crash involving Tesla Model Y",
    "Tesla driver arrested after fatal collision",
    "Fire destroys Tesla dealership overnight",
  ])("discards: %s", (title) => {
    expect(scoreArticle(art(title), TESLA).tier).toBe("discard");
  });

  // The gate must not swallow the business news the feature exists to surface.
  it.each([
    "Tesla announces record Q3 deliveries, beating analyst expectations",
    "Tesla acquires battery startup in $2B deal",
    "Tesla appoints new CFO ahead of 2027 product cycle",
  ])("keeps: %s", (title) => {
    const b = scoreArticle(art(title), TESLA);
    expect(b.unsuitableSignals).toEqual([]);
    expect(b.tier).not.toBe("discard");
  });

  // Negative company news is still legitimate business conversation.
  it("keeps a lawsuit, a probe and a recall", () => {
    for (const title of [
      "Tesla faces shareholder lawsuit over earnings guidance",
      "Regulators open probe into Tesla autopilot marketing",
      "Tesla announces recall of 12,000 vehicles for software fix",
    ]) {
      expect(scoreArticle(art(title), TESLA).unsuitableSignals).toEqual([]);
    }
  });

  it("does not suppress a company whose own name is on the list", () => {
    const ctx: RankContext = { company: "Blast", industry: "fintech", role: "Engineer" };
    const b = scoreArticle(art("Blast raises $20M Series A to expand payments platform"), ctx);
    expect(b.unsuitableSignals).toEqual([]);
  });

  it("keeps unsuitable stories out of the selected headlines entirely", () => {
    const articles = [
      art("Career criminal accused of stolen Tesla rampage that injured woman"),
      art("Tesla announces record Q3 deliveries, beating analyst expectations"),
      art("Two killed in crash involving Tesla Model Y"),
    ];
    const headlines = selectHeadlines(articles, TESLA);
    expect(headlines).toHaveLength(1);
    expect(headlines[0]?.title).toContain("record Q3 deliveries");
  });
});

describe("news: a name match alone is not business news", () => {
  // These carry no crime or filler signal at all — they are simply not about
  // the company as a business. Before the business-relevance requirement they
  // scored "medium" on a properly-capitalised name and were shown.
  it.each([
    "Tesla wins the community fun run sponsorship trophy",
    "Ten things you never knew about Tesla",
    "Tesla spotted filming in downtown Los Angeles",
    "Local school names its robotics team after Tesla",
  ])("discards: %s", (title) => {
    const b = scoreArticle(art(title), TESLA);
    expect(b.unsuitableSignals).toEqual([]);   // not caught by the crime gate
    expect(b.tier).toBe("discard");            // caught by requiring substance
  });

  it.each([
    "Tesla reports record quarterly results and raises guidance",
    "Tesla unveils new manufacturing plant in Texas",
    "Tesla signs supplier agreement for battery cells",
    "Tesla stock climbs after regulatory approval",
  ])("keeps: %s", (title) => {
    expect(scoreArticle(art(title), TESLA).tier).not.toBe("discard");
  });

  it("still keeps an on-topic industry story without a strong verb", () => {
    const b = scoreArticle(art("Tesla automotive division tops delivery rankings"), TESLA);
    expect(b.tier).not.toBe("discard");
  });
});

describe("news: list invariants", () => {
  // STRONG_CONTEXT is documented as a subset of CONTEXT_TERMS. A word missing
  // from CONTEXT_TERMS is never collected by the proximity pass, so adding it
  // to STRONG_CONTEXT alone silently does nothing — which is exactly what
  // happened when this vocabulary was first added.
  it("every strong term is also a context term", () => {
    const src = readFileSync(
      new URL("../../src/lib/newsRanking.ts", import.meta.url),
      "utf8",
    );
    const list = (name: string) => {
      const body = src.split(`const ${name} = new Set([`)[1]?.split("]);")[0] ?? "";
      return new Set([...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
    };
    const context = list("CONTEXT_TERMS");
    const strong = list("STRONG_CONTEXT");
    expect(strong.size).toBeGreaterThan(0);
    const orphans = [...strong].filter((w) => !context.has(w));
    expect(orphans).toEqual([]);
  });
});
