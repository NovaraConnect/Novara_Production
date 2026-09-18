import { describe, it, expect } from "vitest";
import { resolveDeepLink, DEEP_LINK_FALLBACK } from "./nativeDeepLink";

describe("resolveDeepLink", () => {
  it("follows the contact path the scheduler sends", () => {
    expect(resolveDeepLink({ url: "/contacts/9c1f-42" })).toBe("/contacts/9c1f-42");
  });

  it("follows the dashboard path a digest sends", () => {
    expect(resolveDeepLink({ url: "/dashboard" })).toBe("/dashboard");
  });

  it("keeps a query string", () => {
    expect(resolveDeepLink({ url: "/contacts/1?from=push" })).toBe("/contacts/1?from=push");
  });

  it.each([
    ["missing data", undefined],
    ["null data", null],
    ["no url key", { title: "Reconnect with Sarah" }],
    ["a non-string url", { url: 42 }],
    ["an empty url", { url: "" }],
  ])("falls back to the dashboard for %s", (_label, data) => {
    expect(resolveDeepLink(data as Record<string, unknown>)).toBe(DEEP_LINK_FALLBACK);
  });

  it.each([
    ["an absolute URL", "https://example.com/contacts/1"],
    ["a protocol-relative URL", "//example.com/contacts/1"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a relative path", "contacts/1"],
    ["a path smuggling a newline", "/contacts/1\nhttps://example.com"],
  ])("refuses %s", (_label, url) => {
    expect(resolveDeepLink({ url })).toBe(DEEP_LINK_FALLBACK);
  });
});
