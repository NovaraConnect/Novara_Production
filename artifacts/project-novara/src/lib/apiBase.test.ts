import { describe, it, expect, afterEach, vi } from "vitest";

// Regression test target: "incorrect VITE_API_BASE_URL". API_BASE is read
// once from import.meta.env at module load, so each case needs a fresh
// module instance via vi.resetModules() + dynamic import.
describe("API_BASE", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("strips a trailing slash from VITE_API_BASE_URL", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/");
    vi.resetModules();
    const { API_BASE } = await import("./apiBase");
    expect(API_BASE).toBe("https://api.example.com");
  });

  it("leaves a URL with no trailing slash unchanged", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    vi.resetModules();
    const { API_BASE } = await import("./apiBase");
    expect(API_BASE).toBe("https://api.example.com");
  });

  it("falls back to an empty string when VITE_API_BASE_URL is unset", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.resetModules();
    const { API_BASE } = await import("./apiBase");
    expect(API_BASE).toBe("");
  });
});
