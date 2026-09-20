import { describe, it, expect } from "vitest";
import { companyCacheKey, displayCompanyName } from "../../src/lib/news/companyKey";

/** Two spellings share one cached lookup. */
function sameKey(a: string, b: string) {
  const ka = companyCacheKey(a);
  expect(ka).not.toBe("");
  expect(ka).toBe(companyCacheKey(b));
}

/** Two names must NOT be merged — the expensive mistake. */
function differentKey(a: string, b: string) {
  expect(companyCacheKey(a)).not.toBe(companyCacheKey(b));
}

describe("companyCacheKey — spellings that must share a cache entry", () => {
  it("ignores case", () => {
    sameKey("Revolut", "revolut");
    sameKey("REVOLUT", "Revolut");
  });

  it("ignores surrounding and internal whitespace", () => {
    sameKey("  Revolut  ", "Revolut");
    sameKey("Goldman  Sachs", "Goldman Sachs");
  });

  it("ignores accents", () => {
    sameKey("L'Oréal", "L'Oreal");
    sameKey("Nestlé", "Nestle");
  });

  it("ignores apostrophes entirely", () => {
    sameKey("L'Oreal", "LOreal");
    sameKey("Moody's", "Moodys");
  });

  it("treats & and 'and' alike", () => {
    sameKey("Procter & Gamble", "Procter and Gamble");
    sameKey("Johnson & Johnson", "Johnson and Johnson");
  });

  it("drops a single trailing legal suffix", () => {
    sameKey("Apple Inc.", "Apple");
    sameKey("Revolut Ltd", "Revolut");
    sameKey("Nestle S.A.", "Nestle");
    sameKey("Siemens AG", "Siemens");
    sameKey("Tesla, Inc.", "Tesla");
  });

  it("ignores punctuation noise", () => {
    sameKey("NextEra Energy, Inc.", "NextEra Energy");
    sameKey("Coca-Cola", "Coca Cola");
  });
});

describe("companyCacheKey — names that must NOT be merged", () => {
  it("keeps companies whose names are prefixes of each other apart", () => {
    differentKey("Delta", "Delta Air Lines");
    differentKey("Apple", "Apple Hospitality");
    differentKey("Lloyds", "Lloyds Banking Group");
  });

  it("does not strip a legal-form word that is not trailing", () => {
    // "Inc." is the brand here, not a legal form.
    expect(companyCacheKey("Inc Magazine")).toBe("inc magazine");
    differentKey("Inc Magazine", "Magazine");
  });

  it("does not strip more than one trailing suffix", () => {
    // Guards against repeated stripping eroding a name to nothing.
    expect(companyCacheKey("Foo Holdings Ltd")).toBe("foo holdings");
  });

  it("keeps genuinely different companies apart", () => {
    differentKey("Stripe", "Stripe Health");
    differentKey("Square", "Squarespace");
  });
});

describe("companyCacheKey — degenerate input", () => {
  it("returns empty for nothing usable", () => {
    expect(companyCacheKey("")).toBe("");
    expect(companyCacheKey("   ")).toBe("");
    expect(companyCacheKey("!!! ---")).toBe("");
  });

  it("does not reduce a name to a too-weak key", () => {
    // Stripping would leave "hp", which is too short to be a safe shared key,
    // so the un-stripped form is used instead.
    const k = companyCacheKey("HP Inc");
    expect(k.length).toBeGreaterThanOrEqual(3);
    expect(k).toContain("hp");
  });

  it("caps key length", () => {
    expect(companyCacheKey("a".repeat(500)).length).toBeLessThanOrEqual(120);
  });
});

describe("displayCompanyName", () => {
  it("tidies whitespace but preserves the real name for the provider", () => {
    expect(displayCompanyName("  Goldman   Sachs ")).toBe("Goldman Sachs");
    expect(displayCompanyName("L'Oréal")).toBe("L'Oréal");
  });
});
