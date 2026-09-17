import { describe, it, expect } from "vitest";
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
