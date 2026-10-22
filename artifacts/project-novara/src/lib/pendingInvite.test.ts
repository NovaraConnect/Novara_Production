import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  captureTokenFromHash,
  clearPendingInvite,
  PENDING_INVITE_KEY,
  readPendingInvite,
  storePendingInvite,
  universityUiEnabled,
} from "./pendingInvite";
import { UniversityApiError } from "./universityApi";

const TOKEN = "a".repeat(43);

// Tests run in the node environment, so window and sessionStorage are stubbed.
// Only the members the module touches are provided.
function installFakeBrowser() {
  const store = new Map<string, string>();
  const loc = { pathname: "/invite", search: "", hash: "" };
  const history = {
    state: null as unknown,
    replaceState(_state: unknown, _title: string, url: string) {
      const u = new URL(url, "https://app.test");
      loc.pathname = u.pathname;
      loc.search = u.search;
      loc.hash = u.hash;
    },
  };
  vi.stubGlobal("window", { location: loc, history });
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  return { loc, store };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("captureTokenFromHash", () => {
  it("reads the token from the fragment, stores it, and removes the fragment", () => {
    const { loc } = installFakeBrowser();
    loc.hash = `#${TOKEN}`;
    const got = captureTokenFromHash();
    expect(got).toBe(TOKEN);
    expect(loc.hash).toBe("");
    expect(loc.pathname).toBe("/invite");
    expect(readPendingInvite()).toBe(TOKEN);
  });

  it("returns null and stores nothing when there is no valid fragment", () => {
    const { loc } = installFakeBrowser();
    loc.hash = "#not-a-token";
    expect(captureTokenFromHash()).toBeNull();
    expect(readPendingInvite()).toBeNull();
  });

  it("never reads a token from the query string", () => {
    const { loc } = installFakeBrowser();
    loc.search = `?token=${TOKEN}`;
    expect(captureTokenFromHash()).toBeNull();
    expect(readPendingInvite()).toBeNull();
  });
});

describe("pending invite storage", () => {
  beforeEach(() => installFakeBrowser());

  it("round-trips a well-formed token and clears it", () => {
    storePendingInvite(TOKEN);
    expect(sessionStorage.getItem(PENDING_INVITE_KEY)).toBe(TOKEN);
    expect(readPendingInvite()).toBe(TOKEN);
    clearPendingInvite();
    expect(readPendingInvite()).toBeNull();
  });

  it("ignores a stored value that is not a token", () => {
    sessionStorage.setItem(PENDING_INVITE_KEY, "<script>");
    expect(readPendingInvite()).toBeNull();
  });
});

describe("universityUiEnabled", () => {
  it("is off unless the build sets VITE_UNIVERSITY_ACCESS to true", () => {
    vi.stubEnv("VITE_UNIVERSITY_ACCESS", "");
    expect(universityUiEnabled()).toBe(false);
    vi.stubEnv("VITE_UNIVERSITY_ACCESS", "1");
    expect(universityUiEnabled()).toBe(false);
    vi.stubEnv("VITE_UNIVERSITY_ACCESS", "true");
    expect(universityUiEnabled()).toBe(true);
  });
});

describe("UniversityApiError", () => {
  it("carries the server error code and status", () => {
    const err = new UniversityApiError(410, "already_used");
    expect(err.code).toBe("already_used");
    expect(err.status).toBe(410);
    expect(err).toBeInstanceOf(Error);
  });
});
