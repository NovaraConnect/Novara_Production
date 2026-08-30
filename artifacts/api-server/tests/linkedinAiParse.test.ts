import { describe, it, expect, afterEach } from "vitest";
import {
  parseLinkedInTextWith,
  linkedinParseLogFields,
  isLinkedInAiParseEnabled,
  activeLinkedInProvider,
} from "../src/lib/linkedinAiParse";

const GOOD = JSON.stringify({
  firstName: "Priya",
  lastName: "Raman",
  role: "Head of Growth",
  company: "Northwind Labs",
  location: "Austin, Texas",
  linkedinUrl: "https://linkedin.com/in/priya-raman",
  confidence: "high",
  warnings: [],
});

// Messy OCR: LinkedIn app chrome interleaved with the real content, the
// headline glued to the employer, and the connection count on its own line.
const MESSY_OCR = [
  "Home  My Network  Jobs  Messaging  Notifications",
  "Priya Raman",
  "Head of Growth at Northwind Labs | ex-Acme",
  "Austin, Texas  ·  Contact info",
  "500+ connections",
  "Message   Connect   More",
].join("\n");

describe("parseLinkedInTextWith — success / fallback signals", () => {
  it("parses valid JSON from the provider", async () => {
    const r = await parseLinkedInTextWith(MESSY_OCR, async () => GOOD);
    expect(r).not.toBeNull();
    expect(r!.fields.firstName).toBe("Priya");
    expect(r!.fields.role).toBe("Head of Growth");
    expect(r!.fields.company).toBe("Northwind Labs");
    expect(r!.fields.location).toBe("Austin, Texas");
    expect(r!.confidence).toBe("high");
  });

  it("returns null on invalid JSON (→ caller falls back)", async () => {
    expect(await parseLinkedInTextWith("x", async () => "not json at all")).toBeNull();
  });

  it("returns null when the provider yields null (disabled/no output)", async () => {
    expect(await parseLinkedInTextWith("x", async () => null)).toBeNull();
  });

  it("returns null when the provider throws (error/timeout-abort)", async () => {
    expect(
      await parseLinkedInTextWith("x", async () => {
        throw new Error("boom");
      }),
    ).toBeNull();
  });

  it("returns null when the provider aborts on the timeout signal", async () => {
    const r = await parseLinkedInTextWith("x", async (_s, _u, signal) => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      if (signal) throw err;
      return GOOD;
    });
    expect(r).toBeNull();
  });

  it("tolerates code fences / prose around the JSON", async () => {
    const wrapped = "Here you go:\n```json\n" + GOOD + "\n```";
    const r = await parseLinkedInTextWith("x", async () => wrapped);
    expect(r!.fields.lastName).toBe("Raman");
  });
});

describe("validation is strict and drops contact fields", () => {
  it("never returns email or phone, even when the model sends them", async () => {
    const withContact = JSON.stringify({
      firstName: "Priya",
      lastName: "Raman",
      role: "Head of Growth",
      company: "Northwind Labs",
      location: "Austin, Texas",
      linkedinUrl: null,
      email: "priya@northwind.example",
      phone: "+1 512 555 0100",
      confidence: "high",
      warnings: [],
    });
    const r = await parseLinkedInTextWith("x", async () => withContact);
    expect(r).not.toBeNull();
    const keys = Object.keys(r!.fields).sort();
    expect(keys).toEqual(
      ["company", "firstName", "lastName", "linkedinUrl", "location", "role"].sort(),
    );
    expect(JSON.stringify(r!.fields)).not.toContain("priya@northwind.example");
    expect(JSON.stringify(r!.fields)).not.toContain("555");
  });

  it("coerces non-string fields to null and defaults confidence to low", async () => {
    const junk = JSON.stringify({
      firstName: 42,
      lastName: null,
      role: { nested: true },
      company: [],
      location: false,
      linkedinUrl: null,
      confidence: "definitely",
      warnings: "not-an-array",
    });
    const r = await parseLinkedInTextWith("x", async () => junk);
    expect(r).not.toBeNull();
    expect(r!.fields.firstName).toBeNull();
    expect(r!.fields.role).toBeNull();
    expect(r!.fields.company).toBeNull();
    expect(r!.confidence).toBe("low"); // → merge layer keeps the deterministic draft
    expect(r!.warnings).toEqual([]);
  });
});

describe("feature gating — must be explicitly enabled", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is off when the flag is unset, even with a provider and key", () => {
    delete process.env["LINKEDIN_AI_PARSE"];
    process.env["LINKEDIN_AI_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    expect(isLinkedInAiParseEnabled()).toBe(false);
  });

  it("is off when the provider is not explicitly selected (no auto-default)", () => {
    process.env["LINKEDIN_AI_PARSE"] = "on";
    delete process.env["LINKEDIN_AI_PROVIDER"];
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    process.env["GEMINI_API_KEY"] = "g-test";
    expect(activeLinkedInProvider()).toBeNull();
    expect(isLinkedInAiParseEnabled()).toBe(false);
  });

  it("is off when the selected provider's key is missing (no cross-provider fallback)", () => {
    process.env["LINKEDIN_AI_PARSE"] = "on";
    process.env["LINKEDIN_AI_PROVIDER"] = "anthropic";
    delete process.env["ANTHROPIC_API_KEY"];
    process.env["GEMINI_API_KEY"] = "g-test";
    expect(activeLinkedInProvider()).toBeNull();
    expect(isLinkedInAiParseEnabled()).toBe(false);
  });

  it("is on only with flag + explicit provider + that provider's key", () => {
    process.env["LINKEDIN_AI_PARSE"] = "on";
    process.env["LINKEDIN_AI_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    expect(activeLinkedInProvider()).toBe("anthropic");
    expect(isLinkedInAiParseEnabled()).toBe(true);
  });

  it("is independent of the business-card flag", () => {
    process.env["CARD_AI_PARSE"] = "on";
    process.env["CARD_AI_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    delete process.env["LINKEDIN_AI_PARSE"];
    expect(isLinkedInAiParseEnabled()).toBe(false);
  });
});

describe("logging is metadata-only", () => {
  it("never includes the OCR text or any parsed personal field", async () => {
    const result = await parseLinkedInTextWith(MESSY_OCR, async () => GOOD);
    const logged = linkedinParseLogFields(MESSY_OCR, result, 123, "anthropic");
    const serialized = JSON.stringify(logged);

    expect(Object.keys(logged).sort()).toEqual(
      ["confidence", "event", "ms", "ok", "provider", "textLen"].sort(),
    );
    for (const secret of [
      "Priya",
      "Raman",
      "Head of Growth",
      "Northwind Labs",
      "Austin",
      "linkedin.com/in/priya-raman",
      "connections",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(logged.textLen).toBe(MESSY_OCR.length);
    expect(logged.ok).toBe(true);
    expect(logged.confidence).toBe("high");
  });

  it("reports ok:false with a null confidence when the parse failed", () => {
    const logged = linkedinParseLogFields("some ocr text", null, 42, "gemini");
    expect(logged.ok).toBe(false);
    expect(logged.confidence).toBeNull();
  });
});
