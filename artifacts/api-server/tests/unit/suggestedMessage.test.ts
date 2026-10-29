import { describe, it, expect, afterEach } from "vitest";
import {
  buildPrompt,
  validateMessage,
  templateMessage,
  suggestMessageWith,
  suggestedMessageLogFields,
  isSuggestedMessageAiEnabled,
  activeMessageProvider,
  daysUntilBirthday,
  type SuggestionInput,
} from "../../src/lib/suggestedMessage";

const TODAY = new Date("2026-10-29T15:00:00Z");

const BASE: SuggestionInput = {
  firstName: "Priya",
  company: "Northwind Labs",
  role: "Head of Growth",
  metAt: "the Austin product meetup",
  firstContactDate: "2026-09-10",
  lastInteractionDate: "2026-10-01",
  notes: "Loves trail running. Mentioned they are hiring a PM in Q1.",
  birthday: null,
  headline: "Northwind Labs opens a new office in Denver",
  careerStatement: "Moving into product management in consumer tech.",
  careerGoals: ["Land a product role at a growth-stage startup"],
  channel: "text",
};

const GOOD = JSON.stringify({
  message:
    "Hi Priya, it was a pleasure meeting you at the Austin product meetup. I read that Northwind Labs is opening a Denver office and thought of you. Would you be open to catching up soon?",
});

describe("buildPrompt", () => {
  it("includes the profile fields the draft is built from", () => {
    const p = buildPrompt(BASE, TODAY);
    expect(p).toContain("CHANNEL: TEXT");
    expect(p).toContain("First name: Priya");
    expect(p).toContain("Role: Head of Growth");
    expect(p).toContain("Company: Northwind Labs");
    expect(p).toContain("Where we met: the Austin product meetup");
    expect(p).toContain("Last spoke: about 4 weeks ago");
    expect(p).toContain("Northwind Labs opens a new office in Denver");
    expect(p).toContain("Loves trail running");
    expect(p).toContain("Land a product role at a growth-stage startup");
    expect(p).toContain("Birthday: (none)");
  });

  it("never carries the contact's last name, email, or phone", () => {
    const withExtras = { ...BASE, lastName: "Raman", email: "priya@northwind.example", phone: "+1 512 555 0100" };
    const p = buildPrompt(withExtras as SuggestionInput, TODAY);
    expect(p).not.toContain("Raman");
    expect(p).not.toContain("priya@northwind.example");
    expect(p).not.toContain("555");
  });

  it("marks missing fields (none)/(unknown) so the model skips them", () => {
    const p = buildPrompt({ firstName: "Sam", channel: "email" }, TODAY);
    expect(p).toContain("CHANNEL: EMAIL");
    expect(p).toContain("Company: (unknown)");
    expect(p).toContain("Recent company news headline: (none)");
    expect(p).toContain("My notes about them: (none)");
    expect(p).toContain("Career goals: (none)");
  });

  it("flags a birthday only when it is within a week", () => {
    expect(buildPrompt({ ...BASE, birthday: "--10-29" }, TODAY)).toContain("Birthday: today");
    expect(buildPrompt({ ...BASE, birthday: "--11-02" }, TODAY)).toContain("Birthday: in 4 days");
    expect(buildPrompt({ ...BASE, birthday: "--12-25" }, TODAY)).toContain("Birthday: (none)");
  });

  it("truncates very long notes", () => {
    const p = buildPrompt({ ...BASE, notes: "x".repeat(5000) }, TODAY);
    expect(p.length).toBeLessThan(2000);
  });
});

describe("daysUntilBirthday", () => {
  it("wraps into next year and handles 29 February", () => {
    expect(daysUntilBirthday("--10-28", TODAY)).toBe(364);
    expect(daysUntilBirthday("--02-29", new Date("2027-02-28T00:00:00Z"))).toBe(0);
    expect(daysUntilBirthday("not a date", TODAY)).toBeNull();
  });
});

describe("validateMessage", () => {
  const prompt = buildPrompt(BASE, TODAY);
  const ok = (message: string, channel: SuggestionInput["channel"] = "text") =>
    validateMessage({ message }, channel, prompt);

  it("accepts a natural 2-4 sentence draft", () => {
    expect(ok(JSON.parse(GOOD).message)).toMatch(/^Hi Priya/);
  });

  it("rejects non-objects and missing/non-string messages", () => {
    expect(validateMessage(null, "text", prompt)).toBeNull();
    expect(validateMessage({ msg: "hi" }, "text", prompt)).toBeNull();
    expect(validateMessage({ message: 42 }, "text", prompt)).toBeNull();
  });

  it("rejects emojis, links, emails, and placeholders", () => {
    expect(ok("Hi Priya, great to meet you! 🎉 Want to grab coffee soon?")).toBeNull();
    expect(ok("Hi Priya, great to meet you. Here is my site https://me.example. Coffee soon?")).toBeNull();
    expect(ok("Hi Priya, great to meet you. Email me at me@example.com. Coffee soon?")).toBeNull();
    expect(ok("Hi Priya, great to meet you. Coffee soon? Best, [Your Name]")).toBeNull();
  });

  it("rejects numbers that are not in the input (invented facts)", () => {
    expect(ok("Hi Priya, congrats on raising $40M last week. Coffee soon?")).toBeNull();
  });

  it("enforces length and sentence count per channel", () => {
    expect(ok("Hi Priya.")).toBeNull(); // too short
    const long = "Hi Priya, it was great meeting you and I really enjoyed the conversation. ".repeat(6);
    expect(ok(long, "text")).toBeNull();
    const sixSentences = "Hi Priya. One. Two. Three. Four. Five.";
    expect(ok(sixSentences, "email")).toBeNull();
    const fuller =
      "Hi Priya, it was great meeting you at the Austin product meetup and I keep thinking about our conversation. " +
      "I saw Northwind Labs is opening a new office in Denver, which sounds like an exciting time for the team. " +
      "I'm working toward a product role at a growth-stage startup, so I'd love to hear how you approach growth there. " +
      "Would you be open to a quick call in the next couple of weeks?";
    expect(ok(fuller, "text")).toBeNull();
    expect(ok(fuller, "email")).toBe(fuller);
  });

  it("strips surrounding quotes and collapses whitespace", () => {
    expect(ok('"Hi Priya,\n\nI hope you are well.  Coffee soon?"')).toBe("Hi Priya, I hope you are well. Coffee soon?");
  });

  it("rejects slang, text-speak, and unprofessional form", () => {
    expect(ok("Hey Priya, great meeting you. Wanna grab coffee soon?")).toBeNull();
    expect(ok("Hi Priya, great meeting you lol. Coffee soon?")).toBeNull();
    expect(ok("Hi Priya, thx for the chat. Let me know if u are free.")).toBeNull();
    expect(ok("Hi Priya, great meeting you!! Coffee soon?")).toBeNull();
    expect(ok("Hi Priya! Great meeting you! Coffee soon?")).toBeNull(); // more than one "!"
    expect(ok("hi Priya, great meeting you. Coffee soon?")).toBeNull(); // no capital
    expect(ok("Hi Priya, great meeting you. Coffee soon")).toBeNull(); // no end punctuation
    expect(ok("Hi Priya, it was GREAT meeting you. Coffee soon?")).toBeNull(); // shouting
  });

  it("allows all-caps words that come from the input (acronyms)", () => {
    const p = buildPrompt({ ...BASE, company: "NASDAQ" }, TODAY);
    expect(validateMessage({ message: "Hi Priya, I hope things are going well at NASDAQ. Would you be open to catching up soon?" }, "text", p)).not.toBeNull();
  });
});

describe("templateMessage — deterministic fallback", () => {
  it("builds a short text from where you met + news + ask", () => {
    const m = templateMessage(BASE, TODAY);
    expect(m).toBe(
      "Hi Priya, it was a pleasure meeting you at the Austin product meetup. I read the recent news about Northwind Labs and thought of you. Would you be open to catching up soon?",
    );
    expect(m.length).toBeLessThanOrEqual(320);
  });

  it("is fuller for email: quotes the headline and mentions the goal", () => {
    const m = templateMessage({ ...BASE, channel: "email" }, TODAY);
    expect(m).toContain('("Northwind Labs opens a new office in Denver")');
    expect(m).toContain("(Land a product role at a growth-stage startup)");
    expect(m).toContain("a brief call or coffee in the coming weeks");
  });

  it("leads with a birthday greeting when it is their birthday", () => {
    expect(templateMessage({ ...BASE, birthday: "--10-29" }, TODAY)).toMatch(/^Happy birthday, Priya\. I hope you have a wonderful day\./);
  });

  it("acknowledges a long gap instead of 'great meeting you'", () => {
    const m = templateMessage({ ...BASE, lastInteractionDate: "2026-03-01" }, TODAY);
    expect(m).toMatch(/^Hi Priya, I hope you are doing well\. It has been a while since we last spoke\./);
  });

  it("never uses the private notes", () => {
    expect(templateMessage({ ...BASE, channel: "email" }, TODAY)).not.toContain("trail running");
  });

  it("works with nothing but a first name", () => {
    expect(templateMessage({ firstName: "Sam", channel: "linkedin" }, TODAY)).toBe(
      "Hi Sam, I hope you are doing well. If you are open to it, I would appreciate a brief call or coffee in the coming weeks, whenever is convenient for you.",
    );
  });

  it("capitalizes a lowercase first name", () => {
    expect(templateMessage({ firstName: "priya", channel: "text" }, TODAY)).toMatch(/^Hi Priya,/);
  });

  it("passes its own professionalism checks on every channel", () => {
    for (const channel of ["text", "email", "linkedin"] as const) {
      for (const extra of [{}, { birthday: "--10-29" }, { lastInteractionDate: "2026-01-01" }, { headline: null }]) {
        const input = { ...BASE, ...extra, channel };
        const m = templateMessage(input, TODAY);
        expect(validateMessage({ message: m }, channel, buildPrompt(input, TODAY)), m).toBe(m);
      }
    }
  });

  it("contains no emojis", () => {
    expect(templateMessage({ ...BASE, birthday: "--10-29", channel: "email" }, TODAY)).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("suggestMessageWith — AI or fallback", () => {
  it("uses the AI draft when it validates", async () => {
    const r = await suggestMessageWith(BASE, async () => GOOD, TODAY);
    expect(r.source).toBe("ai");
    expect(r.message).toMatch(/Denver office/);
  });

  it("falls back to the template with no provider", async () => {
    const r = await suggestMessageWith(BASE, null, TODAY);
    expect(r).toEqual({ source: "template", message: templateMessage(BASE, TODAY) });
  });

  it("falls back on invalid JSON, null output, or a failing draft", async () => {
    for (const out of ["not json", null, JSON.stringify({ message: "Hi Priya 🎉. Coffee?" })]) {
      const r = await suggestMessageWith(BASE, async () => out, TODAY);
      expect(r.source).toBe("template");
    }
  });

  it("falls back when the provider throws or aborts", async () => {
    const r = await suggestMessageWith(BASE, async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    }, TODAY);
    expect(r.source).toBe("template");
  });

  it("tolerates code fences around the JSON", async () => {
    const r = await suggestMessageWith(BASE, async () => "```json\n" + GOOD + "\n```", TODAY);
    expect(r.source).toBe("ai");
  });
});

describe("feature gating — must be explicitly enabled", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is off when the flag is unset, even with a provider and key", () => {
    delete process.env["SUGGESTED_MESSAGE_AI"];
    process.env["SUGGESTED_MESSAGE_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    expect(isSuggestedMessageAiEnabled()).toBe(false);
  });

  it("has no auto-default provider and no cross-provider fallback", () => {
    process.env["SUGGESTED_MESSAGE_AI"] = "on";
    delete process.env["SUGGESTED_MESSAGE_PROVIDER"];
    process.env["GEMINI_API_KEY"] = "g-test";
    expect(activeMessageProvider()).toBeNull();
    process.env["SUGGESTED_MESSAGE_PROVIDER"] = "anthropic";
    delete process.env["ANTHROPIC_API_KEY"];
    expect(activeMessageProvider()).toBeNull();
    expect(isSuggestedMessageAiEnabled()).toBe(false);
  });

  it("is on with flag + explicit provider + that provider's key", () => {
    process.env["SUGGESTED_MESSAGE_AI"] = "on";
    process.env["SUGGESTED_MESSAGE_PROVIDER"] = "gemini";
    process.env["GEMINI_API_KEY"] = "g-test";
    expect(activeMessageProvider()).toBe("gemini");
    expect(isSuggestedMessageAiEnabled()).toBe(true);
  });
});

describe("logging is metadata-only", () => {
  it("never includes the notes, profile fields, or message", async () => {
    const r = await suggestMessageWith({ ...BASE, channel: "email" }, async () => GOOD, TODAY);
    const logged = suggestedMessageLogFields(r, "email", 120, "anthropic");
    expect(Object.keys(logged).sort()).toEqual(["channel", "event", "length", "ms", "provider", "source"]);
    const s = JSON.stringify(logged);
    for (const secret of ["Priya", "Northwind", "trail", "meetup", "Denver"]) expect(s).not.toContain(secret);
  });
});
