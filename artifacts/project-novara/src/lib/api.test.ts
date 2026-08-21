import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch, fetchContacts } from "./api";

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
