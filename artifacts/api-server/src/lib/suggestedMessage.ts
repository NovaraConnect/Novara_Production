// ============================================================================
// "Suggested message" for a contact's reach-out moment. Best-effort, never
// throws.
//
// Drafts a short first-person message the user can edit and send themselves
// (the app never sends it). Built from the contact's profile — where/when you
// met, last spoke, notes, role/company, a company headline the client already
// shows, an upcoming birthday — plus the user's career goals, sized to the
// channel (short for a text, a little fuller for email/LinkedIn).
//
// Always returns a message: with the AI disabled, unconfigured, slow, or
// returning anything that fails validation, it falls back to a deterministic
// template built from the same fields.
//
// PRIVACY: the prompt carries the contact's FIRST name only (never last name,
// email, or phone), but it does carry the user's free-text notes about them.
// This module NEVER logs the prompt, the notes, or the message — only
// metadata (provider, duration, channel, source, length). As with the
// LinkedIn parser, the provider MUST be selected explicitly: the Gemini FREE
// tier trains on inputs and MUST NOT be used for real contact notes, so there
// is no auto-default and no cross-provider fallback.
//
// Config (all optional; the template works with none set):
//   SUGGESTED_MESSAGE_AI=on                        enable the AI draft
//   SUGGESTED_MESSAGE_PROVIDER=anthropic|gemini    REQUIRED with the flag
//   ANTHROPIC_API_KEY / GEMINI_API_KEY             provider credential
//   GEMINI_MODEL, SUGGESTED_MESSAGE_ANTHROPIC_MODEL  optional model overrides
// ============================================================================
import { extractJson } from "./cardAiParse";

export type MessageChannel = "text" | "email" | "linkedin";
export type MessageProvider = "anthropic" | "gemini";

export interface SuggestionInput {
  firstName: string;
  company?: string | null;
  role?: string | null;
  metAt?: string | null;
  /** YYYY-MM-DD */
  firstContactDate?: string | null;
  /** YYYY-MM-DD */
  lastInteractionDate?: string | null;
  notes?: string | null;
  /** "--MM-DD" */
  birthday?: string | null;
  /** A recent company-news headline the client is already showing. */
  headline?: string | null;
  careerStatement?: string | null;
  careerGoals?: string[] | null;
  channel: MessageChannel;
}

export interface SuggestionResult {
  message: string;
  source: "ai" | "template";
}

const TIMEOUT_MS = 6000;
const MAX_NOTES = 1000;
const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash";
const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5";
/** Upper bound on the drafted message, by channel. */
const MAX_LENGTH: Record<MessageChannel, number> = { text: 320, email: 700, linkedin: 600 };
const BIRTHDAY_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function flagOn(v: string | undefined): boolean {
  return !!v && ["1", "true", "on", "yes"].includes(v.trim().toLowerCase());
}

/** Chosen provider, or null when unusable. Explicit selection only — see the
 *  PRIVACY note above. */
export function activeMessageProvider(): MessageProvider | null {
  const pref = process.env["SUGGESTED_MESSAGE_PROVIDER"]?.trim().toLowerCase();
  if (pref === "anthropic") return process.env["ANTHROPIC_API_KEY"] ? "anthropic" : null;
  if (pref === "gemini") return process.env["GEMINI_API_KEY"] ? "gemini" : null;
  return null;
}

export function isSuggestedMessageAiEnabled(): boolean {
  return flagOn(process.env["SUGGESTED_MESSAGE_AI"]) && activeMessageProvider() !== null;
}

// ── shared field helpers ─────────────────────────────────────────────────────

function clean(v: string | null | undefined, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseDay(value: string | null | undefined): number | null {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function utcToday(today: Date): number {
  return Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
}

/** Whole days since a YYYY-MM-DD date, or null. */
export function daysSince(value: string | null | undefined, today: Date): number | null {
  const d = parseDay(value);
  return d === null ? null : Math.round((utcToday(today) - d) / DAY_MS);
}

/** Days until the next "--MM-DD" birthday (0 = today), or null. 29 February
 *  falls on 28 February in non-leap years, matching the scheduler. */
export function daysUntilBirthday(birthday: string | null | undefined, today: Date): number | null {
  const m = birthday ? /^--(\d{2})-(\d{2})$/.exec(birthday) : null;
  if (!m) return null;
  const month = Number(m[1]) - 1;
  const day = Number(m[2]);
  const start = utcToday(today);
  for (const year of [today.getUTCFullYear(), today.getUTCFullYear() + 1]) {
    const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
    const d = Date.UTC(year, month, month === 1 && day === 29 && !leap ? 28 : day);
    if (d >= start) return Math.round((d - start) / DAY_MS);
  }
  return null;
}

function describeGap(days: number | null): string {
  if (days === null) return "(unknown)";
  if (days <= 1) return "within the last day";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `about ${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `about ${Math.round(days / 30)} months ago`;
  return "over a year ago";
}

function firstGoal(input: SuggestionInput): string {
  const goal = (input.careerGoals ?? []).map((g) => clean(g, 120)).find(Boolean);
  return goal ?? "";
}

// ── prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  `You draft a short networking message that the user will review, edit, and send themselves to one contact.\n` +
  `Write in the user's voice, first person: warm, professional, and respectful — like a thoughtful professional, not a template and not salesy.\n` +
  `Use correct grammar, spelling, capitalization, and punctuation in complete sentences. No slang, text-speak, abbreviations, or overly casual phrasing ("hey", "gonna", "grab a coffee").\n` +
  `Rules:\n` +
  `- 2 to 4 sentences. For a TEXT keep it under 300 characters; for EMAIL or LINKEDIN it can be a little fuller.\n` +
  `- Start with "Hi <first name>," (or "Happy birthday, <first name>." if their birthday is today).\n` +
  `- Be respectful of their time: no pressure, no flattery, nothing presumptuous or overly familiar.\n` +
  `- Use ONLY facts given in the input. NEVER invent events, dates, numbers, shared history, or details about the company.\n` +
  `- If a field says (none) or (unknown), do not mention it. Do not mention every field; pick the one or two most natural hooks.\n` +
  `- The notes are the user's private notes: use them only for context and natural callbacks; never quote them verbatim or reveal anything awkward or sensitive.\n` +
  `- Mention a news headline only if it reads as positive or neutral, and only in passing.\n` +
  `- Mention the user's career goals only if they relate to this contact's role or company.\n` +
  `- End with a light, low-pressure ask or check-in.\n` +
  `- No emojis, no hashtags, no links, no subject line, no sign-off or name at the end, no placeholders like [Your Name].\n` +
  `Return ONLY strict minified JSON: {"message": string}`;

/** The user prompt. Exported for tests. Contains the contact's first name
 *  only — no last name, email, or phone. */
export function buildPrompt(input: SuggestionInput, today: Date): string {
  const lastSpoke = daysSince(input.lastInteractionDate, today);
  const met = daysSince(input.firstContactDate, today);
  const bday = daysUntilBirthday(input.birthday, today);
  const goals = (input.careerGoals ?? []).map((g) => clean(g, 120)).filter(Boolean);
  const birthdayLine =
    bday === null || bday > BIRTHDAY_WINDOW_DAYS ? "(none)"
      : bday === 0 ? "today"
        : `in ${bday} day${bday === 1 ? "" : "s"}`;

  return (
    `CHANNEL: ${input.channel.toUpperCase()}\n\n` +
    "CONTACT\n" +
    `- First name: ${clean(input.firstName, 60) || "(unknown)"}\n` +
    `- Role: ${clean(input.role) || "(unknown)"}\n` +
    `- Company: ${clean(input.company) || "(unknown)"}\n` +
    `- Where we met: ${clean(input.metAt) || "(unknown)"}\n` +
    `- When we met: ${met === null ? "(unknown)" : describeGap(met)}\n` +
    `- Last spoke: ${describeGap(lastSpoke)}\n` +
    `- Birthday: ${birthdayLine}\n` +
    `- Recent company news headline: ${clean(input.headline, 200) || "(none)"}\n` +
    `- My notes about them: ${clean(input.notes, MAX_NOTES) || "(none)"}\n\n` +
    "ME\n" +
    `- Career statement: ${clean(input.careerStatement, 300) || "(none)"}\n` +
    `- Career goals: ${goals.join("; ") || "(none)"}`
  );
}

// ── validation ───────────────────────────────────────────────────────────────

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const LINK_RE = /https?:\/\/|www\.|\b[\w.+-]+@[\w-]+\.[\w.]+/i;
const PLACEHOLDER_RE = /[[\]{}<>]|\bYour Name\b/i;
/** Slang / text-speak that doesn't belong in a professional message. */
const INFORMAL_RE =
  /\b(hey+|heya|yo|sup|gonna|wanna|gotta|kinda|sorta|lol|lmao|haha+|omg|btw|tbh|imo|thx|ty|pls|plz|u|ur|ya|yeah|yep|nope|dude|bro|cuz|cya|ttyl)\b|[!?]{2,}|\.{4,}/i;

function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length;
}

/** The drafted message if it passes every check, else null (→ template).
 *  Exported for tests. `prompt` is what the model saw: any number in the
 *  draft must appear there, so it can't invent dates or figures. */
export function validateMessage(raw: unknown, channel: MessageChannel, prompt: string): string | null {
  if (!raw || typeof raw !== "object") return null;
  const value = (raw as Record<string, unknown>)["message"];
  if (typeof value !== "string") return null;
  const message = value.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "").trim();

  if (message.length < 20 || message.length > MAX_LENGTH[channel]) return null;
  if (EMOJI_RE.test(message) || LINK_RE.test(message) || PLACEHOLDER_RE.test(message)) return null;
  // Professional form: no slang, opens with a capital, ends on punctuation,
  // and isn't shouting.
  if (INFORMAL_RE.test(message)) return null;
  if (!/^[A-Z]/.test(message) || !/[.!?]$/.test(message)) return null;
  if ((message.match(/!/g) ?? []).length > 1) return null;
  // All-caps words are shouting, unless the input has them (an acronym like
  // a company name).
  for (const word of message.match(/\b[A-Z]{5,}\b/g) ?? []) {
    if (!prompt.includes(word)) return null;
  }
  const sentences = sentenceCount(message);
  if (sentences < 2 || sentences > 5) return null;
  for (const n of message.match(/\d+/g) ?? []) {
    if (!prompt.includes(n)) return null;
  }
  return message;
}

// ── deterministic template ───────────────────────────────────────────────────

/** Always-available draft from the same fields. Exported for tests. Uses no
 *  free text it can't phrase safely — notes are left out on purpose. */
export function templateMessage(input: SuggestionInput, today: Date): string {
  const rawName = clean(input.firstName, 60);
  // Names typed in lowercase ("priya") still open the message properly.
  const name = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : "there";
  const company = clean(input.company);
  const role = clean(input.role);
  const metAt = clean(input.metAt);
  const headline = clean(input.headline, 200);
  const goal = firstGoal(input);
  const short = input.channel === "text";
  const lastSpoke = daysSince(input.lastInteractionDate, today);
  const birthdayToday = daysUntilBirthday(input.birthday, today) === 0;

  const parts: string[] = [];
  if (birthdayToday) {
    parts.push(`Happy birthday, ${name}. I hope you have a wonderful day.`);
  } else if (metAt && (lastSpoke === null || lastSpoke < 60)) {
    parts.push(`Hi ${name}, it was a pleasure meeting you at ${metAt}.`);
  } else if (lastSpoke !== null && lastSpoke >= 60) {
    parts.push(`Hi ${name}, I hope you are doing well. It has been a while since we last spoke.`);
  } else {
    parts.push(`Hi ${name}, I hope you are doing well.`);
  }

  if (headline && company) {
    parts.push(short
      ? `I read the recent news about ${company} and thought of you.`
      : `I read the recent news about ${company} ("${headline}") and thought of you.`);
  } else if (role && company && !short) {
    parts.push(`I would welcome the chance to hear how things are going in your role as ${role} at ${company}.`);
  } else if (company && !short) {
    parts.push(`I would welcome the chance to hear how things are going at ${company}.`);
  }

  if (goal && !short) {
    // Goals are free text ("Land a PM role", "Product in beauty"), so they go
    // in parentheses rather than into a sentence that assumes their grammar.
    parts.push(`I am currently working toward a goal related to your field (${goal.replace(/[.!?]+$/, "")}), and I would value your perspective.`);
  }

  parts.push(short
    ? "Would you be open to catching up soon?"
    : "If you are open to it, I would appreciate a brief call or coffee in the coming weeks, whenever is convenient for you.");

  return parts.join(" ");
}

// ── providers (self-contained, like linkedinAiParse) ─────────────────────────

async function completeGemini(system: string, user: string, signal: AbortSignal): Promise<string | null> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) return null;
  const model = process.env["GEMINI_MODEL"]?.trim() || GEMINI_DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 400 },
    }),
    signal,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  return text || null;
}

async function completeAnthropic(system: string, user: string, signal: AbortSignal): Promise<string | null> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return null;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const model = process.env["SUGGESTED_MESSAGE_ANTHROPIC_MODEL"]?.trim() || ANTHROPIC_DEFAULT_MODEL;
  const msg = await client.messages.create(
    { model, max_tokens: 400, temperature: 0.7, system, messages: [{ role: "user", content: user }] },
    { signal },
  );
  let text = "";
  for (const block of msg.content) if (block.type === "text") text += block.text;
  return text || null;
}

export type CompleteFn = (system: string, user: string, signal: AbortSignal) => Promise<string | null>;

/** Testable core: draft via an injected completion fn (or none → template).
 *  Never throws, always returns a message. */
export async function suggestMessageWith(
  input: SuggestionInput,
  complete: CompleteFn | null,
  today: Date = new Date(),
): Promise<SuggestionResult> {
  const fallback: SuggestionResult = { message: templateMessage(input, today), source: "template" };
  if (!complete) return fallback;

  const prompt = buildPrompt(input, today);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const raw = await complete(SYSTEM_PROMPT, prompt, controller.signal);
    const message = raw ? validateMessage(extractJson(raw), input.channel, prompt) : null;
    return message ? { message, source: "ai" } : fallback;
  } catch (err) {
    // The provider's own error shape only — never the prompt or notes.
    const e = err as { name?: string; status?: number; message?: string };
    console.warn(
      "[suggested-message-error] " +
        JSON.stringify({
          name: e?.name ?? null,
          status: e?.status ?? null,
          message: typeof e?.message === "string" ? e.message.slice(0, 300) : null,
        }),
    );
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

/** Draft using the configured provider, or the template when AI is off. */
export async function suggestMessage(input: SuggestionInput, today: Date = new Date()): Promise<SuggestionResult> {
  const provider = isSuggestedMessageAiEnabled() ? activeMessageProvider() : null;
  const complete = provider === "anthropic" ? completeAnthropic : provider === "gemini" ? completeGemini : null;
  return suggestMessageWith(input, complete, today);
}

/** Log payload — METADATA ONLY. Never the prompt, notes, or message text. */
export function suggestedMessageLogFields(
  result: SuggestionResult,
  channel: MessageChannel,
  ms: number,
  provider: MessageProvider | null,
) {
  return {
    event: "suggested_message",
    provider,
    channel,
    source: result.source,
    ms,
    length: result.message.length,
  };
}
