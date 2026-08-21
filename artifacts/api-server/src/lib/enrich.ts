// ============================================================================
// OPTIONAL, AUTOMATIC AI contact enrichment.
//
// Runs best-effort during contact create/edit and the career-goal recompute,
// so a contact's suggested priority/cadence reflect the company's industry
// (e.g. Tesla → automotive) WITHOUT any manual action. Strictly optional and
// non-blocking: if no provider key is set, or the call fails/times out, the
// contact is still saved with the deterministic result — nothing core depends
// on AI.
//
// Provider-flexible, free-first:
//   • GEMINI_API_KEY    → Google Gemini free tier (default; no card)
//   • ANTHROPIC_API_KEY → Claude Haiku (fallback if no Gemini key)
// Gemini is called over plain HTTPS; the Anthropic SDK is imported lazily.
// ============================================================================

const SYSTEM_PROMPT =
  "You classify a professional contact for a networking CRM. Given a company " +
  "and role, infer (1) the company's primary industry and (2) the contact's " +
  "business function. Use concise canonical lowercase labels — industry " +
  "examples: automotive, fintech, healthcare, aerospace, retail, biotech; " +
  "function examples: product, engineering, sales, marketing, finance, " +
  "operations, design, legal, recruiting. If you cannot determine a field " +
  "with reasonable confidence, use an empty string for it.";

const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash"; // free tier; override via GEMINI_MODEL
const ANTHROPIC_MODEL = "claude-haiku-4-5";
const REQUEST_TIMEOUT_MS = 7000;

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

export interface InferredFacets {
  industry: string | null;
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
 * Infer industry + function from company/role via the configured provider.
 * Throws on any provider/HTTP error (callers wrap in best-effort). Callers
 * MUST gate on isAiEnrichEnabled() first.
 */
export async function inferContactFacets(input: {
  company: string;
  role?: string | null;
}): Promise<InferredFacets> {
  const provider = activeProvider();
  if (!provider) {
    throw new Error("AI enrichment is not enabled (no GEMINI_API_KEY or ANTHROPIC_API_KEY)");
  }
  const company = input.company.trim();
  const role = (input.role ?? "").trim() || "(unknown)";
  return provider === "gemini"
    ? inferViaGemini(company, role)
    : inferViaAnthropic(`Company: ${company}\nRole: ${role}`);
}

/**
 * Best-effort enrichment of blank industry/function. NEVER throws — on any
 * failure it returns the original fields unchanged and reports via onError.
 * Skips the call entirely when disabled, when there's no company, or when both
 * fields are already filled (never overwrites user-entered values).
 */
export async function enrichBlanksBestEffort(
  fields: { company?: string | null; role?: string | null; industry?: string | null; function?: string | null },
  onError?: (message: string) => void,
): Promise<{ industry: string | null; function: string | null; changed: boolean }> {
  const industry0 = fields.industry ?? null;
  const function0 = fields.function ?? null;
  const haveIndustry = String(industry0 ?? "").trim() !== "";
  const haveFunction = String(function0 ?? "").trim() !== "";
  const company = String(fields.company ?? "").trim();

  if (!isAiEnrichEnabled() || !company || (haveIndustry && haveFunction)) {
    return { industry: industry0, function: function0, changed: false };
  }
  try {
    const inferred = await inferContactFacets({ company, role: fields.role });
    const industry = haveIndustry ? industry0 : inferred.industry;
    const fn = haveFunction ? function0 : inferred.function;
    const changed = (!haveIndustry && !!inferred.industry) || (!haveFunction && !!inferred.function);
    return { industry, function: fn, changed };
  } catch (err) {
    onError?.(err instanceof Error ? err.message : String(err));
    return { industry: industry0, function: function0, changed: false };
  }
}

// ── Google Gemini (free tier) — responseMimeType JSON, no strict schema ──────
async function inferViaGemini(company: string, role: string): Promise<InferredFacets> {
  const apiKey = process.env["GEMINI_API_KEY"]!.trim();
  const model = process.env["GEMINI_MODEL"]?.trim() || GEMINI_DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const userText =
    `Company: ${company}\nRole: ${role}\n\n` +
    'Respond with ONLY a JSON object of exactly this shape: ' +
    '{"industry": "<canonical lowercase industry or empty string>", ' +
    '"function": "<canonical lowercase function or empty string>"}';

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
          temperature: 0,
          maxOutputTokens: 256,
        },
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
          properties: { industry: { type: "string" }, function: { type: "string" } },
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
