import { AsyncLocalStorage } from "node:async_hooks";

// Measures what an AI call really cost, from the token counts the provider
// returns. No database here, so the AI modules can import it and stay usable in
// unit tests; lib/aiBudget.ts is what turns the measurement into a cap.
//
// AsyncLocalStorage carries the running total, so the provider functions report
// usage without a user id being threaded through every parser and draft call.

interface Meter {
  micros: number;
}

const meter = new AsyncLocalStorage<Meter>();

// US dollars per 1M tokens, which is the same number as millionths of a dollar
// per token. Gemini is priced at its rate from 2027-01-01, the higher of the
// two published. An unknown model (GEMINI_MODEL or a *_ANTHROPIC_MODEL override)
// is priced high on purpose, so a new model can only hit the cap early.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "gemini-3.6-flash": { input: 1.5, output: 7.5 },
};
const UNKNOWN_MODEL_PRICE = { input: 5, output: 25 };

/** Cost in millionths of a dollar, rounded up. */
export function costMicros(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model] ?? UNKNOWN_MODEL_PRICE;
  return Math.ceil(inputTokens * price.input + outputTokens * price.output);
}

/** Runs `fn` with a fresh meter; returns its result and the cost it reported. */
export async function runMetered<T>(fn: () => Promise<T>): Promise<{ value: T; micros: number }> {
  const store: Meter = { micros: 0 };
  const value = await meter.run(store, fn);
  return { value, micros: store.micros };
}

export function reportAnthropicUsage(
  model: string,
  usage: { input_tokens?: number | null; output_tokens?: number | null } | null | undefined,
): void {
  const store = meter.getStore();
  if (store) store.micros += costMicros(model, usage?.input_tokens ?? 0, usage?.output_tokens ?? 0);
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}

export function reportGeminiUsage(model: string, usage: GeminiUsageMetadata | null | undefined): void {
  const store = meter.getStore();
  if (!store) return;
  // Thinking tokens are billed as output.
  const output = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
  store.micros += costMicros(model, usage?.promptTokenCount ?? 0, output);
}
