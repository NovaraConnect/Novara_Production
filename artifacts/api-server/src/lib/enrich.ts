// ============================================================================
// OPTIONAL AI matching engine.
//
// When a provider key is configured, the AI judges how well a contact aligns
// with the user's WHOLE career profile (free-text statement + listed goals +
// goal tags, considered together) and returns a priority band directly —
// semantic matching, not keyword overlap (beauty ≈ cosmetics ≈ L'Oréal,
// fashion ≈ apparel ≈ luxury, fintech ≈ financial services). It also infers
// the contact's industry/function for display and news relevance.
//
// Strictly optional and non-blocking: with no key, or on any failure/timeout,
// callers fall back to the deterministic keyword matcher
// (computeSuggestedPriority). Nothing core depends on AI.
//
// Provider-flexible, free-first:
//   • GEMINI_API_KEY    → Google Gemini free tier (default; no card)
//   • ANTHROPIC_API_KEY → Claude Haiku (fallback if no Gemini key)
// ============================================================================

import { normalizePriority, type PriorityLevel } from "./priority";

const SYSTEM_PROMPT =
  "You are the matching engine for a professional networking CRM. Given a " +
  "user's career goals and a single contact, decide how high a NETWORKING " +
  "PRIORITY this contact should be for the user, and infer the contact's " +
  "industry and business function.\\n\\n" +
  "Priority is exactly one of: High, Medium, Low.\\n" +
  "- High: the contact strongly advances the user's stated goals — they do, " +
  "or hire for, the kind of role/work the user wants AND are at a company or " +
  "in an industry the user is targeting; or they are a recruiter / talent " +
  "lead for a target industry.\\n" +
  "- Medium: partial or indirect alignment — the right industry but a " +
  "different function, or the right kind of role but an unrelated industry, " +
  "or a loose/adjacent connection.\\n" +
  "- Low: no meaningful alignment with the user's goals.\\n\\n" +
  "Judge by MEANING, not exact words: treat synonyms and clearly related " +
  "concepts as matches (beauty ≈ cosmetics ≈ personal care ≈ L'Oréal; fashion " +
  "≈ apparel ≈ luxury; fintech ≈ financial services ≈ banking; automotive ≈ " +
  "cars ≈ mobility). The user's free-text statement, listed goals, and goal " +
  "tags are COMPLEMENTARY — any of them can drive a match, and they never " +
  "override each other.\\n\\n" +
  "Also return: industry — the company's primary industry as 2-5 lowercase " +
  "keywords/synonyms; function — the contact's business function as 1-3 " +
  "lowercase keywords. Empty string if unknown.\\n\\n" +
  'Return ONLY a JSON object: {"priority": "High|Medium|Low", "reason": "<one ' +
  'short sentence explaining the alignment>", "industry": "<keywords or empty>", ' +
  '"function": "<keywords or empty>"}';

const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash"; // free tier; override via GEMINI_MODEL
const ANTHROPIC_MODEL = "claude-haiku-4-5";
const REQUEST_TIMEOUT_MS = 6000;

type Provider = "gemini" | "anthropic";

function activeProvider(): Provider | null {
  if (process.env["GEMINI_API_KEY"]?.trim()) return "gemini";
  if (process.env["ANTHROPIC_API_KEY"]?.trim()) return "anthropic";
  return null;
}

/** True only when a provider key is configured. */
export function isAiEnrichEnabled(): boolean {
  return activeProvider() !== null;
}

export interface UserGoals {
  careerStatement?: string | null;
  careerGoals?: string[] | null;
  goalTags?: string[] | null;
}

export interface AnalyzedContact {
  company?: string | null;
  role?: string | null;
  industry?: string | null;
  function?: string | null;
  notes?: string | null;
  interests?: string[] | null;
}

export interface ContactAnalysis {
  priority: PriorityLevel;
  reason: string;
  industry: string | null;
  function: string | null;
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "unknown" || trimmed === "n/a") return null;
  return trimmed.length <= 100 ? trimmed : null;
}

function hasGoalSignal(goals: UserGoals): boolean {
  const statement = String(goals.careerStatement ?? "").trim();
  const list = (goals.careerGoals ?? []).filter((g) => String(g ?? "").trim());
  const tags = (goals.goalTags ?? []).filter((t) => String(t ?? "").trim());
  return statement !== "" || list.length > 0 || tags.length > 0;
}

/**
 * AI-judged match. Returns the priority band + reason (and inferred
 * industry/function) for one contact against the user's whole profile.
 * Best-effort: returns null when AI is disabled, the profile has no goal
 * signal, or the provider call fails/times out — callers then fall back to the
 * deterministic matcher. Never throws.
 */
export async function analyzeContactWithAI(
  goals: UserGoals,
  contact: AnalyzedContact,
  onError?: (message: string) => void,
): Promise<ContactAnalysis | null> {
  if (!isAiEnrichEnabled() || !hasGoalSignal(goals) || !String(contact.company ?? "").trim()) {
    return null;
  }

  const userText =
    "USER CAREER GOALS\n" +
    `- Career statement: ${String(goals.careerStatement ?? "").trim() || "(none)"}\n` +
    `- Goals: ${(goals.careerGoals ?? []).filter(Boolean).join("; ") || "(none)"}\n` +
    `- Goal tags: ${(goals.goalTags ?? []).filter(Boolean).join("; ") || "(none)"}\n\n` +
    "CONTACT\n" +
    `- Company: ${String(contact.company ?? "").trim() || "(unknown)"}\n` +
    `- Role: ${String(contact.role ?? "").trim() || "(unknown)"}\n` +
    `- Interests: ${(contact.interests ?? []).filter(Boolean).join("; ") || "(none)"}\n` +
    `- Notes: ${String(contact.notes ?? "").trim() || "(none)"}`;

  try {
    const text = activeProvider() === "gemini"
      ? await completeViaGemini(userText)
      : await completeViaAnthropic(userText);
    return parseAnalysis(text);
  } catch (err) {
    onError?.(err instanceof Error ? err.message : String(err));
    return null;
  }
}

function parseAnalysis(text: string | null | undefined): ContactAnalysis | null {
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const obj = (parsed ?? {}) as {
    priority?: unknown;
    reason?: unknown;
    industry?: unknown;
    function?: unknown;
  };
  // Require a priority the model actually chose; otherwise treat as a failure
  // so the caller falls back to deterministic scoring.
  const rawPriority = typeof obj.priority === "string" ? obj.priority.trim() : "";
  if (!/^(high|medium|low)$/i.test(rawPriority)) return null;
  return {
    priority: normalizePriority(rawPriority),
    reason: typeof obj.reason === "string" ? obj.reason.trim().slice(0, 240) : "",
    industry: cleanLabel(obj.industry),
    function: cleanLabel(obj.function),
  };
}

// ── Google Gemini (free tier) — responseMimeType JSON ────────────────────────
async function completeViaGemini(userText: string): Promise<string | null> {
  const apiKey = process.env["GEMINI_API_KEY"]!.trim();
  const model = process.env["GEMINI_MODEL"]?.trim() || GEMINI_DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 300 },
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini(${model}) HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

// ── Anthropic Claude (fallback) — lazy-imported SDK ──────────────────────────
async function completeViaAnthropic(userText: string): Promise<string | null> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            priority: { type: "string" },
            reason: { type: "string" },
            industry: { type: "string" },
            function: { type: "string" },
          },
          required: ["priority", "reason", "industry", "function"],
          additionalProperties: false,
        },
      },
    },
    messages: [{ role: "user", content: userText }],
  });
  for (const block of message.content) {
    if (block.type === "text") return block.text;
  }
  return null;
}
