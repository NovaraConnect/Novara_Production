// ============================================================================
// OPTIONAL AI contact enrichment.
//
// This is strictly opt-in. Nothing in the core app (auth, contacts, settings,
// feedback, dashboard, build, App Store path) depends on it. The feature is
// enabled ONLY when ANTHROPIC_API_KEY is present in the environment; when the
// key is absent every caller sees `isAiEnrichEnabled() === false` and the
// route returns a graceful "feature disabled" response instead of erroring.
//
// The Anthropic SDK is imported lazily (dynamic import inside the call) so the
// server starts, and every non-AI request runs, without the dependency ever
// being loaded — and without the key ever being required.
// ============================================================================

// Cheap classification model — a single short call per contact. See the
// project's AI-enrichment doc for the cost note (~$0.00025/contact).
const AI_ENRICH_MODEL = "claude-haiku-4-5";

/** True only when an Anthropic key is configured. The single gate every AI
 *  code path checks before doing anything. */
export function isAiEnrichEnabled(): boolean {
  return Boolean(process.env["ANTHROPIC_API_KEY"]?.trim());
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
  // Keep labels short and canonical; drop anything implausibly long.
  return trimmed.length <= 60 ? trimmed : null;
}

/**
 * Infer a contact's industry and business function from their company + role.
 * One structured, low-token call. Callers MUST gate on isAiEnrichEnabled()
 * first; this throws if invoked without a key.
 */
export async function inferContactFacets(input: {
  company: string;
  role?: string | null;
}): Promise<InferredFacets> {
  if (!isAiEnrichEnabled()) {
    throw new Error("AI enrichment is not enabled (no ANTHROPIC_API_KEY)");
  }

  // Lazy import — the SDK is never loaded unless enrichment actually runs.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const company = input.company.trim();
  const role = (input.role ?? "").trim() || "(unknown)";

  const message = await client.messages.create({
    model: AI_ENRICH_MODEL,
    max_tokens: 200,
    system:
      "You classify a professional contact for a networking CRM. Given a " +
      "company and role, infer (1) the company's primary industry and (2) the " +
      "contact's business function. Use concise canonical lowercase labels — " +
      "industry examples: automotive, fintech, healthcare, aerospace, retail, " +
      "biotech; function examples: product, engineering, sales, marketing, " +
      "finance, operations, design, legal, recruiting. If you cannot determine " +
      "a field with reasonable confidence, return an empty string for it.",
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
    messages: [
      { role: "user", content: `Company: ${company}\nRole: ${role}` },
    ],
  });

  // The SDK's ContentBlock union narrows on `.type`; find the text block.
  let text: string | undefined;
  for (const block of message.content) {
    if (block.type === "text") {
      text = block.text;
      break;
    }
  }
  if (!text) return { industry: null, function: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { industry: null, function: null };
  }
  const obj = (parsed ?? {}) as { industry?: unknown; function?: unknown };
  return {
    industry: cleanLabel(obj.industry),
    function: cleanLabel(obj.function),
  };
}
