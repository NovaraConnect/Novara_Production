import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch, fetchContacts, fetchFeatures, readCachedFeatures } from "./api";

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws Unauthorized and never calls fetch when there is no token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const getToken = vi.fn().mockResolvedValue(null);

    await expect(apiFetch(getToken, "/api/contacts")).rejects.toThrow("Unauthorized");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("prefixes the request URL with API_BASE and sets the Bearer token", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const getToken = vi.fn().mockResolvedValue("test-token-123");

    await apiFetch(getToken, "/api/contacts");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/contacts$/);
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer test-token-123");
  });
});

describe("fetchContacts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws Unauthorized on a 401 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const getToken = vi.fn().mockResolvedValue("test-token-123");

    await expect(fetchContacts(getToken)).rejects.toThrow("Unauthorized");
  });

  it("returns parsed contacts on success", async () => {
    const contacts = [{ id: "1", firstName: "Ada", lastName: "Lovelace" }];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(contacts), { status: 200 }),
    );
    const getToken = vi.fn().mockResolvedValue("test-token-123");

    await expect(fetchContacts(getToken)).resolves.toEqual(contacts);
  });
});

describe("fetchFeatures", () => {
  const getToken = () => Promise.resolve("test-token-123");

  // Tests run in the node environment (vitest.config.ts), so localStorage is
  // stubbed the same way installPrompt.test.ts stubs window.
  beforeEach(() => {
    vi.restoreAllMocks();
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });

  it("caches the flags a reachable server returns", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ linkedinScreenshotImport: true, cardAiParse: true }), { status: 200 }),
    );

    const features = await fetchFeatures(getToken);

    expect(features.linkedinScreenshotImport).toBe(true);
    expect(readCachedFeatures()?.linkedinScreenshotImport).toBe(true);
  });

  // The bug this guards: a 502 used to resolve to every flag false, which read
  // as "the server turned these off" and removed the LinkedIn importer from
  // Add Contact during a database outage.
  it("throws rather than reporting every flag off when the API is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("gateway error", { status: 502 }));

    await expect(fetchFeatures(getToken)).rejects.toThrow(/502/);
  });

  it("keeps the last known flags through a failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ linkedinScreenshotImport: true }), { status: 200 }),
    );
    await fetchFeatures(getToken);

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    await expect(fetchFeatures(getToken)).rejects.toThrow();

    expect(readCachedFeatures()?.linkedinScreenshotImport).toBe(true);
  });

  it("reports nothing cached on a first run that never reached the API", () => {
    expect(readCachedFeatures()).toBeNull();
  });

  it("lets a reachable server switch a feature off", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ linkedinScreenshotImport: true }), { status: 200 }),
    );
    await fetchFeatures(getToken);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ linkedinScreenshotImport: false }), { status: 200 }),
    );
    const features = await fetchFeatures(getToken);

    expect(features.linkedinScreenshotImport).toBe(false);
    expect(readCachedFeatures()?.linkedinScreenshotImport).toBe(false);
  });
});
