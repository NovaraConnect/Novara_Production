// ============================================================================
// OPTIONAL AI contact enrichment.
//
// Strictly opt-in. Nothing in the core app (auth, contacts, settings,
// feedback, dashboard, build, App Store path) depends on it. The feature is
// enabled ONLY when a provider key is present; when none is set every caller
// sees `isAiEnrichEnabled() === false` and the route returns a graceful
// "feature disabled" response instead of erroring.
//
// Provider-flexible, free-first:
//   • GEMINI_API_KEY   → Google Gemini free tier (default; no card required)
//   • ANTHROPIC_API_KEY → Claude Haiku (fallback if no Gemini key)
// Gemini is called over plain HTTPS (no SDK dependency); the Anthropic SDK is
// imported lazily so the server starts, and every non-AI request runs, without
// either dependency being loaded or any key being required.
// ============================================================================

const SYSTEM_PROMPT =
  "You classify a professional contact for a networking CRM. Given a company " +
  "and role, infer (1) the company's primary industry and (2) the contact's " +
  "business function. Use concise canonical lowercase labels — industry " +
  "examples: automotive, fintech, healthcare, aerospace, retail, biotech; " +
  "function examples: product, engineering, sales, marketing, finance, " +
  "operations, design, legal, recruiting. If you cannot determine a field " +
  "with reasonable confidence, return an empty string for it.";

// Cheap classification models — a single short call per contact.
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash"; // free tier; override via GEMINI_MODEL
const ANTHROPIC_MODEL = "claude-haiku-4-5";
const REQUEST_TIMEOUT_MS = 8000;

type Provider = "gemini" | "anthropic";

function activeProvider(): Provider | null {
  if (process.env["GEMINI_API_KEY"]?.trim()) return "gemini";
  if (process.env["ANTHROPIC_API_KEY"]?.trim()) return "anthropic";
  return null;
}

/** True only when a provider key is configured. The single gate every AI code
 *  path checks before doing anything. */
export function isAiEnrichEnabled(): boolean {
  return activeProvider() !== null;
}

export interface InferredFacets {
  /** Canonical lowercase industry (e.g. "automotive"), or null if unknown. */
  industry: string | null;
  /** Canonical lowercase business function (e.g. "product"), or null. */
  function: string | null;
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "unknown" || trimmed === "n/a") return null;
  return trimmed.length <= 60 ? trimmed : null;
}

function parseFacets(text: string | null | undefined): InferredFacets {
  if (!text) return { industry: null, function: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { industry: null, function: null };
  }
  const obj = (parsed ?? {}) as { industry?: unknown; function?: unknown };
  return { industry: cleanLabel(obj.industry), function: cleanLabel(obj.function) };
}

/**
 * Infer a contact's industry and business function from their company + role.
 * One structured, low-token call via whichever provider is configured. Callers
 * MUST gate on isAiEnrichEnabled() first; this throws if no key is present.
 */
export async function inferContactFacets(input: {
  company: string;
  role?: string | null;
}): Promise<InferredFacets> {
  const provider = activeProvider();
  if (!provider) {
    throw new Error(
      "AI enrichment is not enabled (no GEMINI_API_KEY or ANTHROPIC_API_KEY)",
    );
  }
  const company = input.company.trim();
  const role = (input.role ?? "").trim() || "(unknown)";
  const userText = `Company: ${company}\nRole: ${role}`;

  return provider === "gemini"
    ? inferViaGemini(userText)
    : inferViaAnthropic(userText);
}

// ── Google Gemini (free tier) — plain HTTPS, no SDK ──────────────────────────
async function inferViaGemini(userText: string): Promise<InferredFacets> {
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
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: { industry: { type: "STRING" }, function: { type: "STRING" } },
            required: ["industry", "function"],
          },
          temperature: 0,
          maxOutputTokens: 200,
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini responded with HTTP ${res.status}: ${body.slice(0, 160)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return parseFacets(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

// ── Anthropic Claude (fallback) — lazy-imported SDK ──────────────────────────
async function inferViaAnthropic(userText: string): Promise<InferredFacets> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            industry: { type: "string" },
            function: { type: "string" },
          },
          required: ["industry", "function"],
          additionalProperties: false,
        },
      },
    },
    messages: [{ role: "user", content: userText }],
  });

  let text: string | undefined;
  for (const block of message.content) {
    if (block.type === "text") {
      text = block.text;
      break;
    }
  }
  return parseFacets(text);
}
