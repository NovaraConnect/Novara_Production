import { describe, it, expect } from "vitest";
import { classifyApnsFailure, isApnsEnvironment, isApnsConfigured } from "../../src/lib/apns";

describe("classifyApnsFailure — only delete tokens that are genuinely dead", () => {
  it("treats 410 as gone (app uninstalled)", () => {
    expect(classifyApnsFailure(410, "Unregistered")).toBe("gone");
  });

  it("treats BadDeviceToken as gone", () => {
    // The usual cause is an environment mismatch: a sandbox token sent to the
    // production host, or vice versa.
    expect(classifyApnsFailure(400, "BadDeviceToken")).toBe("gone");
  });

  it("treats DeviceTokenNotForTopic as gone", () => {
    expect(classifyApnsFailure(400, "DeviceTokenNotForTopic")).toBe("gone");
  });

  it("keeps the token when APNs is having a bad day", () => {
    // Deleting on a 503 would silently unsubscribe a real user, and they would
    // have no way to know notifications had stopped.
    expect(classifyApnsFailure(503, "ServiceUnavailable")).toBe("retryable");
    expect(classifyApnsFailure(429, "TooManyRequests")).toBe("retryable");
  });

  it("keeps the token when the failure is our own auth problem", () => {
    // A bad .p8 or wrong Key ID is ours to fix; the device token is fine.
    expect(classifyApnsFailure(403, "InvalidProviderToken")).toBe("retryable");
    expect(classifyApnsFailure(403, "ExpiredProviderToken")).toBe("retryable");
  });

  it("keeps the token when APNs tells us nothing useful", () => {
    expect(classifyApnsFailure(undefined, undefined)).toBe("retryable");
  });
});

describe("isApnsEnvironment", () => {
  it("accepts the two real APNs hosts", () => {
    expect(isApnsEnvironment("production")).toBe(true);
    expect(isApnsEnvironment("sandbox")).toBe(true);
  });

  it("rejects anything else, so a bad DB value falls back to production", () => {
    for (const value of ["prod", "dev", "", null, undefined, 1, {}]) {
      expect(isApnsEnvironment(value)).toBe(false);
    }
  });
});

describe("isApnsConfigured", () => {
  it("is false with no APNS_* environment variables set", () => {
    // This is the property that makes the whole feature safe to deploy before
    // the Apple key exists: unconfigured means inert, not broken.
    expect(isApnsConfigured()).toBe(false);
  });
});
