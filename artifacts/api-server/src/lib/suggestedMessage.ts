// ============================================================================
// "Suggested message" for a contact's reach-out moment. Best-effort, never
// throws.
//
// Drafts ONE short first-person message (at most 500 characters) that works
// as a text, an email, or a LinkedIn message, plus a subject line used when
// it goes by email. The user edits and sends it themselves — the app never
// sends anything. Built from the contact's profile (where/when you met, last
// spoke, notes, role/company, a company headline the client already shows, an
// upcoming birthday) plus the user's career goals.
//
// STAGE: the first reach-out after meeting someone may be very short. Once
// you've been in touch since (an interaction logged after the day you met),
// every draft must use at least one real detail from their profile; the
// validator rejects follow-ups that don't, and the template always has one.
//
// TONE: every draft must be grammatically correct, professional, and
// respectful. The prompt asks for that, validateDraft() enforces it, and the
// template is held to the same checks in tests.
//
// Always returns a draft: with the AI disabled, unconfigured, over its daily
// cap, slow, or returning anything that fails validation, it falls back to a
// deterministic template built from the same fields.
//
// COST: one call per draft on the cheapest models already in use (Claude
// Haiku / Gemini Flash), roughly a fifth of a cent each. DraftBudget caps AI
// drafts per contact and per user per day; past a cap the template is served,
// so a user never sees an error and spend stays bounded.
//
// PRIVACY: the prompt carries the contact's FIRST name only (never last name,
// email, or phone), but it does carry the user's notes about them. This module
// NEVER logs the prompt, the notes, or the draft — metadata only. It uses the
// provider already chosen explicitly for the card parser (CARD_AI_PROVIDER, or
// LINKEDIN_AI_PROVIDER), so there is still no auto-default: with neither set,
// the AI is off. As documented for those parsers, a Gemini key must be a
// paid / no-training setup.
//
// Config (all optional; the template works with none set):
//   SUGGESTED_MESSAGE_AI=off             switch the AI draft off (on by default
//                                        whenever a provider is configured)
//   SUGGESTED_MESSAGE_PROVIDER           override the inherited provider
//   CARD_AI_PROVIDER / LINKEDIN_AI_PROVIDER  inherited provider choice
//   ANTHROPIC_API_KEY / GEMINI_API_KEY   provider credential
//   GEMINI_MODEL, SUGGESTED_MESSAGE_ANTHROPIC_MODEL  optional model overrides
// ============================================================================
import { extractJson } from "./cardAiParse";

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
}

export interface Draft {
  subject: string;
  message: string;
}

export interface SuggestionResult extends Draft {
  source: "ai" | "template";
}

/** Hard ceiling on a reach-out message, for every channel. */
export const MAX_MESSAGE_LENGTH = 500;
const MAX_SUBJECT_LENGTH = 70;
const TIMEOUT_MS = 6000;
const MAX_NOTES = 1000;
const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash";
const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5";
const BIRTHDAY_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function flagOff(v: string | undefined): boolean {
  return !!v && ["0", "false", "off", "no"].includes(v.trim().toLowerCase());
}

function providerFor(pref: string | undefined): MessageProvider | null {
  const p = pref?.trim().toLowerCase();
  if (p === "anthropic") return process.env["ANTHROPIC_API_KEY"] ? "anthropic" : null;
  if (p === "gemini") return process.env["GEMINI_API_KEY"] ? "gemini" : null;
  return null;
}

/** The provider the app already uses for AI text (explicitly chosen for the
 *  card / LinkedIn parsers), or null when none is configured. */
export function activeMessageProvider(): MessageProvider | null {
  for (const key of ["SUGGESTED_MESSAGE_PROVIDER", "CARD_AI_PROVIDER", "LINKEDIN_AI_PROVIDER"]) {
    const pref = process.env[key];
    if (pref?.trim()) return providerFor(pref);
  }
  return null;
}

export function isSuggestedMessageAiEnabled(): boolean {
  return !flagOff(process.env["SUGGESTED_MESSAGE_AI"]) && activeMessageProvider() !== null;
}

// ── daily cost cap ───────────────────────────────────────────────────────────

/**
 * Per-day AI draft allowance, per contact and per user. In memory: it resets
 * on a deploy or restart, which is fine for a cost ceiling (it can only ever
 * allow one extra day's worth). Exported for tests.
 */
export class DraftBudget {
  private day = "";
  private perUser = new Map<string, number>();
  private perContact = new Map<string, number>();

  constructor(readonly maxPerContact = 5, readonly maxPerUser = 40) {}

  /** Uses one AI draft if both allowances have room. */
  take(userId: string, contactId: string, now: Date = new Date()): boolean {
    const today = now.toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.perUser.clear();
      this.perContact.clear();
    }
    const contactKey = `${userId}:${contactId}`;
    const u = this.perUser.get(userId) ?? 0;
    const c = this.perContact.get(contactKey) ?? 0;
    if (u >= this.maxPerUser || c >= this.maxPerContact) return false;
    this.perUser.set(userId, u + 1);
    this.perContact.set(contactKey, c + 1);
    return true;
  }
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

/** True until an interaction is logged after the day you met: a new
 *  contact's "last spoke" starts equal to "first met", and Mark contacted
 *  moves it later. Exported for tests. */
export function isFirstReachOut(input: SuggestionInput): boolean {
  const first = parseDay(input.firstContactDate);
  const last = parseDay(input.lastInteractionDate);
  return first === null || last === null || last <= first;
}

const STOPWORDS = new Set([
  "about", "after", "again", "their", "there", "these", "those", "which", "while", "would", "could",
  "should", "where", "being", "other", "really", "great", "thing", "things", "people", "today",
  "during", "before", "through", "since", "until", "still", "maybe", "might", "every", "first",
]);

/** Distinctive words from the profile a personalized message could use. */
function profileTerms(input: SuggestionInput): Set<string> {
  const text = [input.company, input.role, input.metAt, input.headline, input.notes, ...(input.careerGoals ?? [])]
    .filter(Boolean).join(" ").toLowerCase();
  const name = clean(input.firstName).toLowerCase();
  return new Set((text.match(/[a-z][a-z'-]{3,}/g) ?? []).filter((w) => w.length >= 4 && w !== name && !STOPWORDS.has(w)));
}

/** Does the message use at least one detail from the profile? Profiles with
 *  nothing to draw on pass, so a sparse contact still gets a draft. */
export function usesProfileDetail(message: string, input: SuggestionInput): boolean {
  const terms = profileTerms(input);
  if (terms.size === 0) return true;
  return (message.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []).some((w) => terms.has(w));
}

function capitalized(name: string): string {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : name;
}

// ── prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  `You draft a short networking message that the user will review, edit, and send themselves to one contact, ` +
  `by text, email, or LinkedIn — the same message must read well in any of them.\n` +
  `Write in the user's voice, first person: warm, professional, and respectful — like a thoughtful professional, not a template and not salesy.\n` +
  `Use correct grammar, spelling, capitalization, and punctuation in complete sentences. No slang, text-speak, abbreviations, or overly casual phrasing ("hey", "gonna", "grab a coffee").\n` +
  `Rules:\n` +
  `- At most ${MAX_MESSAGE_LENGTH} characters in total. Length depends on STAGE:\n` +
  `  - FIRST REACH-OUT (first message since meeting): short and simple is best — 2 sentences is fine. Refer to where you met if known.\n` +
  `  - FOLLOW-UP (you have been in touch before): 2 to 4 sentences that MUST be personalized with at least one specific, ` +
  `relevant detail from the input (their role or company, a company headline, something from the notes, a shared interest, ` +
  `or a goal of mine that relates to their work). A generic check-in is not acceptable.\n` +
  `- Start with "Hi <first name>," (or "Happy birthday, <first name>." if their birthday is today).\n` +
  `- Be respectful of their time: no pressure, no flattery, nothing presumptuous or overly familiar.\n` +
  `- Use ONLY facts given in the input. NEVER invent events, dates, numbers, shared history, or details about the company.\n` +
  `- If a field says (none) or (unknown), do not mention it. Do not mention every field; pick the one or two most natural hooks.\n` +
  `- The notes are the user's private notes: use them only for context and natural callbacks; never quote them verbatim or reveal anything awkward or sensitive.\n` +
  `- Mention a news headline only if it reads as positive or neutral, and only in passing.\n` +
  `- Mention the user's career goals only if they relate to this contact's role or company.\n` +
  `- End with a light, low-pressure ask or check-in.\n` +
  `- No emojis, no hashtags, no links, no sign-off or name at the end, no placeholders like [Your Name].\n` +
  `Also write an email subject line for the same message: professional, specific to what the message is about, ` +
  `3 to 8 words, sentence case, no ending punctuation, no emojis (e.g. "Following up from the product meetup").\n` +
  `Return ONLY strict minified JSON: {"subject": string, "message": string}`;

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
    `STAGE: ${isFirstReachOut(input) ? "FIRST REACH-OUT" : "FOLLOW-UP"}\n\n` +
    "CONTACT\n" +
    `- First name: ${capitalized(clean(input.firstName, 60)) || "(unknown)"}\n` +
    `- Role: ${clean(input.role) || "(unknown)"}\n` +
    `- Company: ${clean(input.company) || "(unknown)"}\n` +
    `- Where we met: ${clean(input.metAt, 100) || "(unknown)"}\n` +
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

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "").trim();
}

/** Checks shared by message and subject: no emoji, links, placeholders,
 *  slang, shouting, or numbers the input doesn't contain (invented facts). */
function passesCommonChecks(text: string, prompt: string): boolean {
  if (EMOJI_RE.test(text) || LINK_RE.test(text) || PLACEHOLDER_RE.test(text) || INFORMAL_RE.test(text)) return false;
  if (!/^[A-Z]/.test(text)) return false;
  // All-caps words are shouting, unless the input has them (an acronym).
  for (const word of text.match(/\b[A-Z]{5,}\b/g) ?? []) {
    if (!prompt.includes(word)) return false;
  }
  for (const n of text.match(/\d+/g) ?? []) {
    if (!prompt.includes(n)) return false;
  }
  return true;
}

/** The message if it passes every check, else null. Exported for tests. */
export function validateMessage(value: unknown, prompt: string): string | null {
  if (typeof value !== "string") return null;
  const message = normalize(value);
  if (message.length < 20 || message.length > MAX_MESSAGE_LENGTH) return null;
  if (!passesCommonChecks(message, prompt)) return null;
  if (!/[.!?]$/.test(message)) return null;
  if ((message.match(/!/g) ?? []).length > 1) return null;
  const sentences = sentenceCount(message);
  if (sentences < 2 || sentences > 5) return null;
  return message;
}

/** The subject if it passes, else null. Exported for tests. */
export function validateSubject(value: unknown, prompt: string): string | null {
  if (typeof value !== "string") return null;
  const subject = normalize(value).replace(/^subject:\s*/i, "");
  if (subject.length < 3 || subject.length > MAX_SUBJECT_LENGTH) return null;
  if (/[.!?:;,]$/.test(subject)) return null;
  if (!passesCommonChecks(subject, prompt)) return null;
  return subject;
}

/** The AI draft if its message validates. A bad subject alone doesn't throw
 *  away a good message — it's swapped for the template subject. */
export function validateDraft(
  raw: unknown,
  prompt: string,
  fallbackSubject: string,
  input?: SuggestionInput,
): Draft | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const message = validateMessage(o["message"], prompt);
  if (!message) return null;
  // Follow-ups must be personalized; a generic one falls back to the
  // template, which always is.
  if (input && !isFirstReachOut(input) && !usesProfileDetail(message, input)) return null;
  return { message, subject: validateSubject(o["subject"], prompt) ?? fallbackSubject };
}

// ── deterministic template ───────────────────────────────────────────────────

/** Always-available draft from the same fields. Exported for tests. Uses no
 *  free text it can't phrase safely — notes are left out on purpose.
 *
 *  First reach-out: short — where you met and a simple ask. Follow-up: always
 *  personalized with the company news or their role/company, plus a related
 *  goal when there is one; optional sentences are dropped, least important
 *  first, to stay under the cap. */
export function templateDraft(input: SuggestionInput, today: Date): Draft {
  const name = capitalized(clean(input.firstName, 60)) || "there";
  const company = clean(input.company, 80);
  const role = clean(input.role, 80);
  const metAt = clean(input.metAt, 80);
  const headline = clean(input.headline, 200);
  const goal = firstGoal(input).replace(/[.!?]+$/, "");
  const lastSpoke = daysSince(input.lastInteractionDate, today);
  const birthdayToday = daysUntilBirthday(input.birthday, today) === 0;
  const longGap = lastSpoke !== null && lastSpoke >= 60;
  const close = "If you are open to it, I would appreciate a brief call or coffee in the coming weeks.";

  if (isFirstReachOut(input)) {
    const where = metAt ? ` at ${metAt}` : "";
    const opening = birthdayToday
      ? `Happy birthday, ${name}. I hope you have a wonderful day.`
      : longGap
        ? `Hi ${name}, I hope you are doing well. It has been a while since we met${where}.`
        : `Hi ${name}, it was a pleasure meeting you${where}.`;
    const subject = birthdayToday
      ? "Happy birthday"
      : metAt && metAt.length <= 45 ? `Following up from ${metAt}` : "Following up on our introduction";
    return { subject, message: `${opening} I would welcome the chance to stay in touch, and I hope we can talk again soon.` };
  }

  let opening: string;
  let subject: string;
  if (birthdayToday) {
    opening = `Happy birthday, ${name}. I hope you have a wonderful day.`;
    subject = "Happy birthday";
  } else if (longGap) {
    opening = `Hi ${name}, I hope you are doing well. It has been a while since we last spoke.`;
    subject = "Reconnecting";
  } else {
    opening = `Hi ${name}, I hope you are doing well.`;
    subject = headline && company ? `Recent news at ${company}` : "Checking in";
  }

  // Middle sentences in order of preference; each has a shorter fallback used
  // when the full draft would pass the cap. The company line is the one
  // detail always kept, so a follow-up is never generic.
  const news = headline && company
    ? [`I read the recent news about ${company} ("${headline}") and thought of you.`, `I read the recent news about ${company} and thought of you.`]
    : null;
  const work = !news && company
    ? [
      role
        ? `I would welcome the chance to hear how things are going in your role as ${role} at ${company}.`
        : `I would welcome the chance to hear how things are going at ${company}.`,
      `I would welcome the chance to hear how things are going at ${company}.`,
    ]
    : null;
  const goalLine = goal
    ? [`I am currently working toward a goal related to your field (${goal}), and I would value your perspective.`]
    : null;

  const options = [news ?? work, goalLine].filter((o): o is string[] => !!o);
  const chosen = options.map((o) => o[0]);
  const build = () => [opening, ...chosen.filter(Boolean), close].join(" ");
  // Shrink from the least important sentence (last) backwards; the first
  // (the company detail) only ever shrinks to its short form.
  for (let i = options.length - 1; i >= 0 && build().length > MAX_MESSAGE_LENGTH; i--) {
    chosen[i] = options[i][1] ?? "";
    if (build().length > MAX_MESSAGE_LENGTH && i > 0) chosen[i] = "";
  }
  return { subject, message: build() };
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
      generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 300 },
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
    { model, max_tokens: 300, temperature: 0.7, system, messages: [{ role: "user", content: user }] },
    { signal },
  );
  let text = "";
  for (const block of msg.content) if (block.type === "text") text += block.text;
  return text || null;
}

export type CompleteFn = (system: string, user: string, signal: AbortSignal) => Promise<string | null>;

/** Testable core: draft via an injected completion fn (or none → template).
 *  Never throws, always returns a draft. */
export async function suggestMessageWith(
  input: SuggestionInput,
  complete: CompleteFn | null,
  today: Date = new Date(),
): Promise<SuggestionResult> {
  const template = templateDraft(input, today);
  const fallback: SuggestionResult = { ...template, source: "template" };
  if (!complete) return fallback;

  const prompt = buildPrompt(input, today);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const raw = await complete(SYSTEM_PROMPT, prompt, controller.signal);
    const draft = raw ? validateDraft(extractJson(raw), prompt, template.subject, input) : null;
    return draft ? { ...draft, source: "ai" } : fallback;
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

/** Draft with the configured provider when `allowAi`, else the template. */
export async function suggestMessage(
  input: SuggestionInput,
  allowAi: boolean,
  today: Date = new Date(),
): Promise<SuggestionResult> {
  const provider = allowAi && isSuggestedMessageAiEnabled() ? activeMessageProvider() : null;
  const complete = provider === "anthropic" ? completeAnthropic : provider === "gemini" ? completeGemini : null;
  return suggestMessageWith(input, complete, today);
}

/** Why a draft came from the template, for the log. */
export type TemplateReason = "ai_off" | "not_subscribed" | "daily_cap" | "ai_failed";

/** Log payload — METADATA ONLY. Never the prompt, notes, subject, or message. */
export function suggestedMessageLogFields(
  result: SuggestionResult,
  ms: number,
  provider: MessageProvider | null,
  reason: TemplateReason | null,
) {
  return {
    event: "suggested_message",
    provider,
    source: result.source,
    reason: result.source === "ai" ? null : reason ?? "ai_failed",
    ms,
    length: result.message.length,
  };
}
