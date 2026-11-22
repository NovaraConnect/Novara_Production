import { describe, it, expect } from "vitest";
import { costMicros, reportAnthropicUsage, reportGeminiUsage, runMetered } from "../../src/lib/aiUsage";

describe("costMicros", () => {
  it("prices Claude Haiku 4.5 at $1 in and $5 out per million tokens", () => {
    expect(costMicros("claude-haiku-4-5", 1_000_000, 0)).toBe(1_000_000);
    expect(costMicros("claude-haiku-4-5", 0, 1_000_000)).toBe(5_000_000);
  });

  it("prices an unknown model above every listed one", () => {
    expect(costMicros("some-new-model", 1000, 100)).toBeGreaterThan(costMicros("gemini-3.6-flash", 1000, 100));
  });

  it("rounds a fraction of a micro up", () => {
    expect(costMicros("gemini-3.6-flash", 1, 0)).toBe(2);
  });
});

describe("runMetered", () => {
  it("adds up everything reported during the call", async () => {
    const { value, micros } = await runMetered(async () => {
      reportAnthropicUsage("claude-haiku-4-5", { input_tokens: 1000, output_tokens: 200 });
      await Promise.resolve();
      reportGeminiUsage("gemini-3.6-flash", { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 100 });
      return "done";
    });
    expect(value).toBe("done");
    expect(micros).toBe(2000 + 3000);
  });

  it("keeps parallel calls apart", async () => {
    const run = (tokens: number) => runMetered(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      reportAnthropicUsage("claude-haiku-4-5", { input_tokens: tokens, output_tokens: 0 });
    });
    const [a, b] = await Promise.all([run(100), run(900)]);
    expect(a.micros).toBe(100);
    expect(b.micros).toBe(900);
  });

  it("treats missing usage as zero and reporting outside a call as a no-op", async () => {
    expect(() => reportAnthropicUsage("claude-haiku-4-5", null)).not.toThrow();
    const { micros } = await runMetered(async () => {
      reportAnthropicUsage("claude-haiku-4-5", undefined);
      reportGeminiUsage("gemini-3.6-flash", undefined);
    });
    expect(micros).toBe(0);
  });
});
