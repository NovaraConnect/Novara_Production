import { describe, it, expect, afterEach } from "vitest";
import { createInviteToken, hashToken, normalizeEmail, isWellFormedToken, maskEmail, inviteUrlFor } from "../../src/lib/invitations";
import { universityAccessEnabled } from "../../src/lib/flags";

describe("invite tokens", () => {
  it("are 43-character base64url strings that pass the shape check", () => {
    const { raw } = createInviteToken();
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isWellFormedToken(raw)).toBe(true);
  });

  it("store only a SHA-256 hash, never the raw value", () => {
    const { raw, hash } = createInviteToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(raw);
    expect(hashToken(raw)).toBe(hash);
  });

  it("are distinct across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(createInviteToken().raw);
    expect(seen.size).toBe(2000);
  });

  it("reject junk shapes before any lookup", () => {
    expect(isWellFormedToken(undefined)).toBe(false);
    expect(isWellFormedToken(123)).toBe(false);
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken("a".repeat(43) + "!")).toBe(false);
    expect(isWellFormedToken("a".repeat(44))).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Jane.Doe@School.EDU ")).toBe("jane.doe@school.edu");
  });

  it("rejects non-strings, empties, and malformed addresses", () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("no-at-sign")).toBeNull();
    expect(normalizeEmail("a b@c.d")).toBeNull();
    expect(normalizeEmail(`${"x".repeat(250)}@a.co`)).toBeNull();
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain only", () => {
    expect(maskEmail("jane.doe@school.edu")).toBe("j***@school.edu");
  });
});

describe("inviteUrlFor", () => {
  const original = process.env["INVITE_BASE_URL"];
  afterEach(() => {
    if (original === undefined) delete process.env["INVITE_BASE_URL"];
    else process.env["INVITE_BASE_URL"] = original;
  });

  it("places the token in the fragment, not the path or query", () => {
    delete process.env["INVITE_BASE_URL"];
    const url = new URL(inviteUrlFor("TOKEN_VALUE"));
    expect(url.origin).toBe("https://app.novaraconnect.group");
    expect(url.pathname).toBe("/invite");
    expect(url.search).toBe("");
    expect(url.hash).toBe("#TOKEN_VALUE");
  });

  it("strips trailing slashes from the configured base", () => {
    process.env["INVITE_BASE_URL"] = "https://example.test///";
    expect(inviteUrlFor("T")).toBe("https://example.test/invite#T");
  });
});

describe("universityAccessEnabled", () => {
  const original = process.env["UNIVERSITY_ACCESS_ENABLED"];
  afterEach(() => {
    if (original === undefined) delete process.env["UNIVERSITY_ACCESS_ENABLED"];
    else process.env["UNIVERSITY_ACCESS_ENABLED"] = original;
  });

  it("is off when unset", () => {
    delete process.env["UNIVERSITY_ACCESS_ENABLED"];
    expect(universityAccessEnabled()).toBe(false);
  });

  it("is on only for the exact string true (strict on purpose)", () => {
    for (const v of ["1", "yes", "on", "TRUE", " true "]) {
      process.env["UNIVERSITY_ACCESS_ENABLED"] = v;
      expect(universityAccessEnabled()).toBe(false);
    }
    process.env["UNIVERSITY_ACCESS_ENABLED"] = "true";
    expect(universityAccessEnabled()).toBe(true);
  });
});
