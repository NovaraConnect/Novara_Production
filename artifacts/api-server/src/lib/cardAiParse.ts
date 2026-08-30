// ============================================================================
// OPTIONAL AI text parser for BUSINESS-CARD OCR text. Best-effort, never throws.
//
// Receives ONLY the OCR text (never the image) and returns structured fields.
// Fully gated + failure-safe: when disabled, missing a key, slow, or erroring,
// it returns null and the caller falls back to the deterministic parser.
//
// PRIVACY: business-card text can contain names / emails / phones / addresses.
// This module NEVER logs the text or the parsed fields. In production the
// provider MUST be Anthropic, or a **paid / no-training Gemini** setup where
// submitted content is NOT used to improve Google products — the Gemini FREE
// tier trains on inputs and MUST NOT be used for real card text.
//
// Config (all optional; app works with none set):
//   CARD_AI_PARSE=on            enable the feature (must be explicit)
//   CARD_AI_PROVIDER=anthropic|gemini   REQUIRED — no auto-default, no fallback
//   ANTHROPIC_API_KEY / GEMINI_API_KEY  provider credential (Cloe sets these)
//   GEMINI_MODEL, CARD_AI_ANTHROPIC_MODEL   optional model overrides
// ============================================================================

export type CardProvider = "anthropic" | "gemini";

export interface CardFields {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
}

export interface CardParseResult {
  fields: CardFields;
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
 *  EXPLICITLY via CARD_AI_PROVIDER (`anthropic` | `gemini`) — there is NO
 *  auto-default and NO cross-provider fallback, because card OCR text can
 *  contain personal data. Returns null (→ feature disabled) when the provider
 *  is unset/invalid or the selected provider's key is missing. */
export function activeCardProvider(): CardProvider | null {
  const pref = process.env["CARD_AI_PROVIDER"]?.trim().toLowerCase();
  if (pref === "anthropic") return process.env["ANTHROPIC_API_KEY"] ? "anthropic" : null;
  if (pref === "gemini") return process.env["GEMINI_API_KEY"] ? "gemini" : null;
  return null; // provider not explicitly selected → disabled
}

/** Enabled only when the CARD_AI_PARSE flag is on AND a provider key exists. */
export function isCardAiParseEnabled(): boolean {
  return flagOn(process.env["CARD_AI_PARSE"]) && activeCardProvider() !== null;
}

const SYSTEM_PROMPT =
  `You extract contact fields from the OCR text of a business card the user uploaded.\n` +
  `Return ONLY strict minified JSON with exactly these keys:\n` +
  `{"firstName":string|null,"lastName":string|null,"company":string|null,"role":string|null,` +
  `"email":string|null,"phone":string|null,"website":string|null,` +
  `"confidence":"high"|"medium"|"low","warnings":string[]}\n` +
  `Rules:\n` +
  `- Use ONLY text present in the input. NEVER invent or guess an email, phone, website, name, or company.\n` +
  `- If a value is not clearly present, use null and add a short warning.\n` +
  `- role = the job title only (e.g. "Manager"), not taglines, addresses, or OCR noise.\n` +
  `- Output JSON only. No prose, no code fences.`;

// ── strict validation (no external schema dependency) ──
function asStrOrNull(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t.slice(0, 200) : null;
  }
  return null;
}

function validate(raw: unknown): CardParseResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const conf = o["confidence"];
  const confidence = conf === "high" || conf === "medium" || conf === "low" ? conf : "low";
  const warnings = Array.isArray(o["warnings"])
    ? o["warnings"].filter((w): w is string => typeof w === "string").slice(0, 8)
    : [];
  const fields: CardFields = {
    firstName: asStrOrNull(o["firstName"]),
    lastName: asStrOrNull(o["lastName"]),
    company: asStrOrNull(o["company"]),
    role: asStrOrNull(o["role"]),
    email: asStrOrNull(o["email"]),
    phone: asStrOrNull(o["phone"]),
    website: asStrOrNull(o["website"]),
  };
  return { fields, confidence, warnings };
}

/** Tolerate stray prose / code fences around the JSON object. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ── providers (self-contained; NOT reusing the matching-enrich path) ──
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
  const model = process.env["CARD_AI_ANTHROPIC_MODEL"]?.trim() || ANTHROPIC_DEFAULT_MODEL;
  const msg = await client.messages.create(
    { model, max_tokens: 400, temperature: 0, system, messages: [{ role: "user", content: user }] },
    { signal },
  );
  let text = "";
  for (const block of msg.content) if (block.type === "text") text += block.text;
  return text || null;
}

/** Testable core: parse via an injected completion fn. Never throws. */
export async function parseCardTextWith(
  text: string,
  complete: (system: string, user: string, signal: AbortSignal) => Promise<string | null>,
): Promise<CardParseResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const raw = await complete(SYSTEM_PROMPT, text.slice(0, MAX_TEXT), controller.signal);
    if (!raw) return null;
    return validate(extractJson(raw));
  } catch (err) {
    // Timeout / provider error → caller falls back to deterministic. Log the
    // provider's OWN error shape (name/status/message) so failures are
    // diagnosable instead of silently swallowed. This is the provider's error
    // text (e.g. "404 model_not_found", "401 authentication_error"), never the
    // OCR text or parsed fields — no PII.
    const e = err as { name?: string; status?: number; message?: string };
    console.warn(
      "[card-parse-error] " +
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
export async function parseCardText(text: string): Promise<CardParseResult | null> {
  if (!isCardAiParseEnabled()) return null;
  const provider = activeCardProvider();
  if (!provider) return null;
  return parseCardTextWith(text, provider === "anthropic" ? completeAnthropic : completeGemini);
}

/** Log payload — METADATA ONLY. Never includes the OCR text or parsed fields. */
export function cardParseLogFields(
  text: string,
  result: CardParseResult | null,
  ms: number,
  provider: CardProvider | null,
) {
  return {
    event: "card_parse",
    provider,
    ms,
    textLen: text.length,
    ok: !!result,
    confidence: result?.confidence ?? null,
  };
}
