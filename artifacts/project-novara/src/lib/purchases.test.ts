import { describe, it, expect } from "vitest";
import { contactLimitApplies, isPaywallVisible, SUBSCRIPTION_ROUTE, waitForPro } from "./purchases";
import type { ProStatus } from "./api";

const FREE: ProStatus = { pro: false, source: null, expiresAt: null };
const PRO: ProStatus = { pro: true, source: "apple_iap", expiresAt: "2030-01-01T00:00:00.000Z" };
const noSleep = async () => undefined;

describe("SUBSCRIPTION_ROUTE", () => {
  // Settings' "Manage Subscription" row and Add Contact link here. Renaming
  // the route would break them, so a change has to be deliberate.
  it("stays /pro", () => {
    expect(SUBSCRIPTION_ROUTE).toBe("/pro");
  });
});

describe("isPaywallVisible", () => {
  const on = { nativePurchases: true, applePaywallFlag: true, universityEntitled: false };

  it("shows only when every gate passes", () => {
    expect(isPaywallVisible(on)).toBe(true);
  });

  it("never shows in a browser (no native purchases)", () => {
    expect(isPaywallVisible({ ...on, nativePurchases: false })).toBe(false);
  });

  it("stays hidden while the server flag is off", () => {
    expect(isPaywallVisible({ ...on, applePaywallFlag: false })).toBe(false);
  });

  it("never shows to university-entitled users", () => {
    expect(isPaywallVisible({ ...on, universityEntitled: true })).toBe(false);
  });
});

describe("contactLimitApplies", () => {
  it("applies the Free limit to a known Free user", () => {
    expect(contactLimitApplies({ isKnown: true, isPro: false })).toBe(true);
  });

  it("lifts the limit for a known Pro user", () => {
    expect(contactLimitApplies({ isKnown: true, isPro: true })).toBe(false);
  });

  it("keeps the Free limit while the status is unknown", () => {
    expect(contactLimitApplies({ isKnown: false, isPro: false })).toBe(true);
  });
});

describe("waitForPro", () => {
  it("returns true as soon as the server reports Pro", async () => {
    const answers: ProStatus[] = [FREE, FREE, PRO];
    let calls = 0;
    const ok = await waitForPro(async () => answers[calls++], { attempts: 5, sleep: noSleep });
    expect(ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("gives up after the attempts run out", async () => {
    let calls = 0;
    const ok = await waitForPro(async () => { calls++; return FREE; }, { attempts: 4, sleep: noSleep });
    expect(ok).toBe(false);
    expect(calls).toBe(4);
  });

  it("counts a failed read as not yet, and keeps trying", async () => {
    let calls = 0;
    const ok = await waitForPro(async () => {
      calls++;
      if (calls < 2) throw new Error("network");
      return PRO;
    }, { attempts: 3, sleep: noSleep });
    expect(ok).toBe(true);
  });
});
