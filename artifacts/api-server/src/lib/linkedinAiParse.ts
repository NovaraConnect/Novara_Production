// ============================================================================
// OPTIONAL AI text parser for LINKEDIN-SCREENSHOT OCR text. Best-effort,
// never throws.
//
// Receives ONLY the OCR text the browser read on-device from a screenshot the
// user already had (never the image itself) and returns structured fields.
// Fully gated + failure-safe: when disabled, missing a key, slow, or erroring
// it returns null and the caller falls back to the deterministic parser.
//
// This is NOT a LinkedIn integration: nothing here contacts LinkedIn, scrapes
// a profile page, or uses a LinkedIn API. The only input is text the user's
// own device extracted from an image the user chose.
//
// PRIVACY: profile text contains a real person's name, employer, and city.
// This module NEVER logs the text or the parsed fields — only metadata
// (provider, duration, text length, ok, confidence). In production the
// provider MUST be Anthropic, or a **paid / no-training Gemini** setup where
// submitted content is NOT used to improve Google products — the Gemini FREE
// tier trains on inputs and MUST NOT be used for real profile text.
//
// Deliberately mirrors lib/cardAiParse.ts rather than sharing its internals:
// the card parser is live in production, and the two features must be able to
// fail, be configured, and be switched off independently of each other.
//
// Config (all optional; app works with none set):
//   LINKEDIN_AI_PARSE=on              enable the feature (must be explicit)
//   LINKEDIN_AI_PROVIDER=anthropic|gemini  REQUIRED — no auto-default, no fallback
//   ANTHROPIC_API_KEY / GEMINI_API_KEY     provider credential (Cloe sets these)
//   GEMINI_MODEL, LINKEDIN_AI_ANTHROPIC_MODEL  optional model overrides
// ============================================================================
import { extractJson } from "./cardAiParse";

export type LinkedInProvider = "anthropic" | "gemini";

/** NOTE: intentionally has NO email/phone. A LinkedIn profile rarely shows
 *  them, and pulling a wrong one is worse than leaving it blank — so they are
 *  not part of the contract at any layer. */
export interface LinkedInAiFields {
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  company: string | null;
  location: string | null;
  linkedinUrl: string | null;
}

export interface LinkedInParseResult {
  fields: LinkedInAiFields;
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

const TIMEOUT_MS = 5000;
const MAX_TEXT = 4000;
const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash";
const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5";

function flagOn(v: string | undefined): boolean {
  return !!v && ["1", "true", "on", "yes"].includes(v.trim().toLowerCase());
}

/** Chosen provider, or null when unusable. The provider MUST be selected
 *  EXPLICITLY via LINKEDIN_AI_PROVIDER (`anthropic` | `gemini`) — there is NO
 *  auto-default and NO cross-provider fallback, because profile OCR text is
 *  personal data about a third party. Returns null (→ feature disabled) when
 *  the provider is unset/invalid or the selected provider's key is missing. */
export function activeLinkedInProvider(): LinkedInProvider | null {
  const pref = process.env["LINKEDIN_AI_PROVIDER"]?.trim().toLowerCase();
  if (pref === "anthropic") return process.env["ANTHROPIC_API_KEY"] ? "anthropic" : null;
  if (pref === "gemini") return process.env["GEMINI_API_KEY"] ? "gemini" : null;
  return null; // provider not explicitly selected → disabled
}

/** Enabled only when the LINKEDIN_AI_PARSE flag is on AND a provider key
 *  exists. Independent of CARD_AI_PARSE. */
export function isLinkedInAiParseEnabled(): boolean {
  return flagOn(process.env["LINKEDIN_AI_PARSE"]) && activeLinkedInProvider() !== null;
}

const SYSTEM_PROMPT =
  `You extract profile fields from the OCR text of a LinkedIn profile screenshot the user uploaded.\n` +
  `Return ONLY strict minified JSON with exactly these keys:\n` +
  `{"firstName":string|null,"lastName":string|null,"role":string|null,"company":string|null,` +
  `"location":string|null,"linkedinUrl":string|null,` +
  `"confidence":"high"|"medium"|"low","warnings":string[]}\n` +
  `Rules:\n` +
  `- Use ONLY text present in the input. NEVER invent or guess a name, company, location, or URL.\n` +
  `- If a value is not clearly present, use null and add a short warning.\n` +
  `- NEVER return an email address or a phone number, and never put one in another field. ` +
  `They are not part of this task even if they appear in the text.\n` +
  `- role = the person's current job title or headline (e.g. "Product Manager", ` +
  `"Head of Growth"). Exclude the company name, connection counts, and app UI text ` +
  `like "Message", "Connect", "500+ connections", "Open to work".\n` +
  `- company = the current employer only. If the headline reads "Product Manager at Acme", ` +
  `role is "Product Manager" and company is "Acme".\n` +
  `- location = the city/region line as shown (e.g. "Austin, Texas"), never a full street address.\n` +
  `- linkedinUrl = only when a profile URL is actually visible in the text; otherwise null.\n` +
  `- Output JSON only. No prose, no code fences.`;

// ── strict validation (no external schema dependency) ──
function asStrOrNull(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t.slice(0, 200) : null;
  }
  return null;
}

/** Builds the result from ONLY the six allowed keys. Anything else the model
 *  returns — notably an email or phone it was told not to produce — is dropped
 *  here rather than trusted, so a prompt-ignoring model still can't smuggle a
 *  contact field through. */
function validate(raw: unknown): LinkedInParseResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const conf = o["confidence"];
  const confidence = conf === "high" || conf === "medium" || conf === "low" ? conf : "low";
  const warnings = Array.isArray(o["warnings"])
    ? o["warnings"].filter((w): w is string => typeof w === "string").slice(0, 8)
    : [];
  const fields: LinkedInAiFields = {
    firstName: asStrOrNull(o["firstName"]),
    lastName: asStrOrNull(o["lastName"]),
    role: asStrOrNull(o["role"]),
    company: asStrOrNull(o["company"]),
    location: asStrOrNull(o["location"]),
    linkedinUrl: asStrOrNull(o["linkedinUrl"]),
  };
  return { fields, confidence, warnings };
}

// ── providers (self-contained; mirrors cardAiParse so the two can't drift
//    into each other's config) ──
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
      generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 400 },
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
  const model = process.env["LINKEDIN_AI_ANTHROPIC_MODEL"]?.trim() || ANTHROPIC_DEFAULT_MODEL;
  const msg = await client.messages.create(
    { model, max_tokens: 400, temperature: 0, system, messages: [{ role: "user", content: user }] },
    { signal },
  );
  let text = "";
  for (const block of msg.content) if (block.type === "text") text += block.text;
  return text || null;
}

/** Testable core: parse via an injected completion fn. Never throws. */
export async function parseLinkedInTextWith(
  text: string,
  complete: (system: string, user: string, signal: AbortSignal) => Promise<string | null>,
): Promise<LinkedInParseResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const raw = await complete(SYSTEM_PROMPT, text.slice(0, MAX_TEXT), controller.signal);
    if (!raw) return null;
    return validate(extractJson(raw));
  } catch (err) {
    // Timeout / provider error → caller falls back to deterministic. Logs the
    // provider's OWN error shape (name/status/message) so failures are
    // diagnosable instead of silently swallowed. Never the OCR text or the
    // parsed fields — no PII.
    const e = err as { name?: string; status?: number; message?: string };
    console.warn(
      "[linkedin-parse-error] " +
        JSON.stringify({
          name: e?.name ?? null,
          status: e?.status ?? null,
          message: typeof e?.message === "string" ? e.message.slice(0, 300) : null,
        }),
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort parse using the configured provider. null if disabled/unusable. */
export async function parseLinkedInText(text: string): Promise<LinkedInParseResult | null> {
  if (!isLinkedInAiParseEnabled()) return null;
  const provider = activeLinkedInProvider();
  if (!provider) return null;
  return parseLinkedInTextWith(text, provider === "anthropic" ? completeAnthropic : completeGemini);
}

/** Log payload — METADATA ONLY. Never includes the OCR text or parsed fields. */
export function linkedinParseLogFields(
  text: string,
  result: LinkedInParseResult | null,
  ms: number,
  provider: LinkedInProvider | null,
) {
  return {
    event: "linkedin_parse",
    provider,
    ms,
    textLen: text.length,
    ok: !!result,
    confidence: result?.confidence ?? null,
  };
}
