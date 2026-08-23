import { describe, it, expect, afterEach } from "vitest";
import {
  parseCardTextWith,
  extractJson,
  cardParseLogFields,
  isCardAiParseEnabled,
  activeCardProvider,
} from "../src/lib/cardAiParse";

const GOOD = JSON.stringify({
  firstName: "Aaron", lastName: "Loeb", company: "Borcelle", role: "Manager",
  email: "hello@reallygreatsite.com", phone: "+123-456-7890", website: "www.reallygreatsite.com",
  confidence: "high", warnings: [],
});

describe("parseCardTextWith — success / fallback signals", () => {
  it("parses valid JSON from the provider", async () => {
    const r = await parseCardTextWith("ocr text", async () => GOOD);
    expect(r).not.toBeNull();
    expect(r!.fields.firstName).toBe("Aaron");
    expect(r!.fields.company).toBe("Borcelle");
    expect(r!.confidence).toBe("high");
  });

  it("returns null on invalid JSON (→ caller falls back)", async () => {
    expect(await parseCardTextWith("x", async () => "not json at all")).toBeNull();
  });

  it("returns null when the provider yields null (disabled/no output)", async () => {
    expect(await parseCardTextWith("x", async () => null)).toBeNull();
  });

  it("returns null when the provider throws (error/timeout-abort)", async () => {
    expect(await parseCardTextWith("x", async () => { throw new Error("boom"); })).toBeNull();
  });

  it("tolerates code fences / prose around the JSON", async () => {
    const wrapped = "Here you go:\n```json\n" + GOOD + "\n```";
    const r = await parseCardTextWith("x", async () => wrapped);
    expect(r!.fields.lastName).toBe("Loeb");
  });
});

describe("validation (via extractJson + parse) is strict", () => {
  it("coerces non-string fields to null and defaults confidence to low", async () => {
    const raw = JSON.stringify({ firstName: 42, email: null, confidence: "bogus", extra: "ignored" });
    const r = await parseCardTextWith("x", async () => raw);
    expect(r!.fields.firstName).toBeNull();
    expect(r!.fields.email).toBeNull();
    expect(r!.confidence).toBe("low");
    // unknown keys are not carried through
    expect((r!.fields as Record<string, unknown>)["extra"]).toBeUndefined();
  });

  it("extractJson returns null when there is no object", () => {
    expect(extractJson("no braces here")).toBeNull();
  });
});

describe("cardParseLogFields — metadata only, no PII", () => {
  it("never includes the OCR text or any parsed field", async () => {
    const text = "Aaron Loeb hello@reallygreatsite.com +123-456-7890";
    const result = await parseCardTextWith(text, async () => GOOD);
    const meta = cardParseLogFields(text, result, 123, "anthropic");
    const serialized = JSON.stringify(meta);
    expect(serialized).not.toContain("Aaron");
    expect(serialized).not.toContain("hello@reallygreatsite.com");
    expect(serialized).not.toContain("123-456-7890");
    expect(meta).toMatchObject({ event: "card_parse", provider: "anthropic", ms: 123, textLen: text.length, ok: true, confidence: "high" });
  });
});

describe("gating & provider selection (no key at startup required)", () => {
  const saved = {
    CARD_AI_PARSE: process.env.CARD_AI_PARSE,
    CARD_AI_PROVIDER: process.env.CARD_AI_PROVIDER,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
  function reset() {
    delete process.env.CARD_AI_PARSE; delete process.env.CARD_AI_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY; delete process.env.GEMINI_API_KEY;
  }

  it("disabled when the flag is off (default) → app works with no AI", () => {
    reset();
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(isCardAiParseEnabled()).toBe(false); // flag not set
  });

  it("disabled when flag on but no provider key present", () => {
    reset();
    process.env.CARD_AI_PARSE = "on";
    expect(activeCardProvider()).toBeNull();
    expect(isCardAiParseEnabled()).toBe(false);
  });

  it("enabled with flag + a key; prefers Anthropic by default", () => {
    reset();
    process.env.CARD_AI_PARSE = "on";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.GEMINI_API_KEY = "g-test";
    expect(activeCardProvider()).toBe("anthropic");
    expect(isCardAiParseEnabled()).toBe(true);
  });

  it("respects CARD_AI_PROVIDER override and requires that provider's key", () => {
    reset();
    process.env.CARD_AI_PARSE = "on";
    process.env.CARD_AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "g-test";
    expect(activeCardProvider()).toBe("gemini");
    reset();
    process.env.CARD_AI_PARSE = "on";
    process.env.CARD_AI_PROVIDER = "anthropic";
    process.env.GEMINI_API_KEY = "g-test"; // wrong key for the chosen provider
    expect(activeCardProvider()).toBeNull();
  });
});
