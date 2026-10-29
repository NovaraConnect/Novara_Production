import { describe, it, expect, afterEach } from "vitest";
import {
  buildPrompt,
  validateMessage,
  validateSubject,
  validateDraft,
  templateDraft,
  suggestMessageWith,
  suggestedMessageLogFields,
  isSuggestedMessageAiEnabled,
  activeMessageProvider,
  daysUntilBirthday,
  DraftBudget,
  MAX_MESSAGE_LENGTH,
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
};

const GOOD_MESSAGE =
  "Hi Priya, it was a pleasure meeting you at the Austin product meetup. I read that Northwind Labs is opening a Denver office and thought of you. Would you be open to catching up soon?";
const GOOD = JSON.stringify({ subject: "Following up from the product meetup", message: GOOD_MESSAGE });

describe("buildPrompt", () => {
  it("includes the profile fields the draft is built from", () => {
    const p = buildPrompt(BASE, TODAY);
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
    const p = buildPrompt({ firstName: "Sam" }, TODAY);
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
  const ok = (message: string) => validateMessage(message, prompt);

  it("accepts a natural 2-4 sentence draft", () => {
    expect(ok(GOOD_MESSAGE)).toBe(GOOD_MESSAGE);
  });

  it("rejects non-strings", () => {
    expect(validateMessage(42, prompt)).toBeNull();
    expect(validateMessage(undefined, prompt)).toBeNull();
  });

  it("rejects emojis, links, emails, and placeholders", () => {
    expect(ok("Hi Priya, great to meet you. 🎉 Would you like to meet soon?")).toBeNull();
    expect(ok("Hi Priya, great to meet you. Here is my site https://me.example. Coffee soon?")).toBeNull();
    expect(ok("Hi Priya, great to meet you. Email me at me@example.com. Coffee soon?")).toBeNull();
    expect(ok("Hi Priya, great to meet you. Coffee soon? Best, [Your Name]")).toBeNull();
  });

  it("rejects numbers that are not in the input (invented facts)", () => {
    expect(ok("Hi Priya, congratulations on raising $40M last week. Coffee soon?")).toBeNull();
  });

  it(`never accepts more than ${MAX_MESSAGE_LENGTH} characters`, () => {
    const long = ("Hi Priya, it was a pleasure meeting you and I enjoyed our conversation. ").repeat(7).trim();
    expect(long.length).toBeGreaterThan(MAX_MESSAGE_LENGTH);
    expect(ok(long)).toBeNull();
    expect(ok("Hi Priya.")).toBeNull(); // too short
    expect(ok("Hi Priya. One. Two. Three. Four. Five.")).toBeNull(); // too many sentences
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
    expect(validateMessage("Hi Priya, I hope things are going well at NASDAQ. Would you be open to catching up soon?", p)).not.toBeNull();
  });
});

describe("validateSubject", () => {
  const prompt = buildPrompt(BASE, TODAY);

  it("accepts a short professional subject", () => {
    expect(validateSubject("Following up from the product meetup", prompt)).toBe("Following up from the product meetup");
    expect(validateSubject("Subject: Reconnecting", prompt)).toBe("Reconnecting");
  });

  it("rejects casual, punctuated, or overlong subjects", () => {
    expect(validateSubject("hey!!", prompt)).toBeNull();
    expect(validateSubject("Quick question.", prompt)).toBeNull();
    expect(validateSubject("Catching up 🙂", prompt)).toBeNull();
    expect(validateSubject("x".repeat(80), prompt)).toBeNull();
    expect(validateSubject("Congrats on the $40M round", prompt)).toBeNull();
  });

  it("keeps a good AI message when only the subject is bad", () => {
    const d = validateDraft({ subject: "yo", message: GOOD_MESSAGE }, prompt, "Checking in");
    expect(d).toEqual({ subject: "Checking in", message: GOOD_MESSAGE });
  });
});

describe("templateDraft — deterministic fallback", () => {
  it("builds one draft from where you met, the news, the goal, and an ask", () => {
    const d = templateDraft(BASE, TODAY);
    expect(d.subject).toBe("Following up from the Austin product meetup");
    expect(d.message).toBe(
      "Hi Priya, it was a pleasure meeting you at the Austin product meetup. " +
        'I read the recent news about Northwind Labs ("Northwind Labs opens a new office in Denver") and thought of you. ' +
        "I am currently working toward a goal related to your field (Land a product role at a growth-stage startup), and I would value your perspective. " +
        "If you are open to it, I would appreciate a brief call or coffee in the coming weeks.",
    );
    expect(d.message.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
  });

  it("drops optional sentences to stay under the cap", () => {
    const d = templateDraft({
      ...BASE,
      metAt: "a".repeat(80),
      headline: "h".repeat(200),
      careerGoals: ["g".repeat(120)],
    }, TODAY);
    expect(d.message.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect(d.message).toMatch(/^Hi Priya, it was a pleasure meeting you/);
    expect(d.message).toMatch(/in the coming weeks\.$/);
  });

  it("leads with a birthday greeting when it is their birthday", () => {
    const d = templateDraft({ ...BASE, birthday: "--10-29" }, TODAY);
    expect(d.message).toMatch(/^Happy birthday, Priya\. I hope you have a wonderful day\./);
    expect(d.subject).toBe("Happy birthday");
  });

  it("acknowledges a long gap", () => {
    const d = templateDraft({ ...BASE, lastInteractionDate: "2026-03-01" }, TODAY);
    expect(d.message).toMatch(/^Hi Priya, I hope you are doing well\. It has been a while since we last spoke\./);
    expect(d.subject).toBe("Reconnecting");
  });

  it("matches the subject to the news when that is the hook", () => {
    expect(templateDraft({ ...BASE, metAt: null }, TODAY).subject).toBe("Recent news at Northwind Labs");
  });

  it("never uses the private notes", () => {
    expect(templateDraft(BASE, TODAY).message).not.toContain("trail running");
  });

  it("works with nothing but a first name, and capitalizes it", () => {
    expect(templateDraft({ firstName: "sam" }, TODAY)).toEqual({
      subject: "Checking in",
      message: "Hi Sam, I hope you are doing well. If you are open to it, I would appreciate a brief call or coffee in the coming weeks.",
    });
  });

  it("passes its own professionalism checks in every situation", () => {
    for (const extra of [{}, { birthday: "--10-29" }, { lastInteractionDate: "2026-01-01" }, { headline: null }, { metAt: null }, { company: null }]) {
      const input = { ...BASE, ...extra };
      const d = templateDraft(input, TODAY);
      const prompt = buildPrompt(input, TODAY);
      expect(validateMessage(d.message, prompt), d.message).toBe(d.message);
      expect(validateSubject(d.subject, prompt), d.subject).toBe(d.subject);
    }
  });
});

describe("suggestMessageWith — AI or fallback", () => {
  it("uses the AI draft when it validates", async () => {
    const r = await suggestMessageWith(BASE, async () => GOOD, TODAY);
    expect(r).toEqual({ source: "ai", subject: "Following up from the product meetup", message: GOOD_MESSAGE });
  });

  it("falls back to the template with no provider", async () => {
    const r = await suggestMessageWith(BASE, null, TODAY);
    expect(r).toEqual({ source: "template", ...templateDraft(BASE, TODAY) });
  });

  it("falls back on invalid JSON, null output, or a failing draft", async () => {
    for (const out of ["not json", null, JSON.stringify({ subject: "Hi", message: "Hi Priya 🎉. Coffee?" })]) {
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

describe("DraftBudget — daily cost cap", () => {
  it("caps AI drafts per contact and per user, and resets the next day", () => {
    const b = new DraftBudget(2, 3);
    const day1 = new Date("2026-10-29T10:00:00Z");
    expect(b.take("u1", "c1", day1)).toBe(true);
    expect(b.take("u1", "c1", day1)).toBe(true);
    expect(b.take("u1", "c1", day1)).toBe(false); // contact cap
    expect(b.take("u1", "c2", day1)).toBe(true);
    expect(b.take("u1", "c3", day1)).toBe(false); // user cap
    expect(b.take("u2", "c1", day1)).toBe(true); // other users unaffected
    expect(b.take("u1", "c1", new Date("2026-10-30T00:01:00Z"))).toBe(true);
  });
});

describe("provider — reuses the one already chosen for AI text", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  const clear = () => {
    for (const k of ["SUGGESTED_MESSAGE_AI", "SUGGESTED_MESSAGE_PROVIDER", "CARD_AI_PROVIDER", "LINKEDIN_AI_PROVIDER", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]) {
      delete process.env[k];
    }
  };

  it("inherits the card parser's provider with no extra setup", () => {
    clear();
    process.env["CARD_AI_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    expect(activeMessageProvider()).toBe("anthropic");
    expect(isSuggestedMessageAiEnabled()).toBe(true);
  });

  it("falls back to the LinkedIn parser's provider", () => {
    clear();
    process.env["LINKEDIN_AI_PROVIDER"] = "gemini";
    process.env["GEMINI_API_KEY"] = "g-test";
    expect(activeMessageProvider()).toBe("gemini");
  });

  it("has no auto-default: a key alone does nothing", () => {
    clear();
    process.env["GEMINI_API_KEY"] = "g-test";
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    expect(activeMessageProvider()).toBeNull();
    expect(isSuggestedMessageAiEnabled()).toBe(false);
  });

  it("does not switch providers when the chosen one has no key", () => {
    clear();
    process.env["CARD_AI_PROVIDER"] = "anthropic";
    process.env["GEMINI_API_KEY"] = "g-test";
    expect(activeMessageProvider()).toBeNull();
  });

  it("can be switched off", () => {
    clear();
    process.env["CARD_AI_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    process.env["SUGGESTED_MESSAGE_AI"] = "off";
    expect(isSuggestedMessageAiEnabled()).toBe(false);
  });
});

describe("logging is metadata-only", () => {
  it("never includes the notes, profile fields, subject, or message", async () => {
    const r = await suggestMessageWith(BASE, async () => GOOD, TODAY);
    const logged = suggestedMessageLogFields(r, 120, "anthropic", null);
    expect(Object.keys(logged).sort()).toEqual(["event", "length", "ms", "provider", "reason", "source"]);
    const s = JSON.stringify(logged);
    for (const secret of ["Priya", "Northwind", "trail", "meetup", "Denver"]) expect(s).not.toContain(secret);
  });

  it("records why a template was served", () => {
    const r = { source: "template" as const, subject: "Checking in", message: "Hi." };
    expect(suggestedMessageLogFields(r, 1, null, "daily_cap").reason).toBe("daily_cap");
  });
});
