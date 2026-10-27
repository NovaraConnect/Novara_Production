import { describe, it, expect } from "vitest";
import {
  addContactBlock,
  annualSavingLabel,
  daysLeft,
  FREE_TIER_LIMIT,
  isPaywallVisible,
  subscriptionGate,
  subscriptionLabel,
  subscriptionPlanFor,
  subscriptionTerms,
  SUBSCRIPTION_ROUTE,
  waitForPro,
} from "./purchases";
import type { ProStatus } from "./api";

const FREE: ProStatus = { pro: false, source: null, expiresAt: null, state: "none", billingPeriod: null };
const PRO: ProStatus = {
  pro: true,
  source: "apple_iap",
  expiresAt: "2030-01-01T00:00:00.000Z",
  state: "active",
  billingPeriod: "monthly",
};
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

describe("addContactBlock", () => {
  const base = { isKnown: true, isPro: false, subscriptionRequired: false, contactCount: 0 };

  it("before a subscription is required, Free users stop at the ceiling", () => {
    expect(addContactBlock({ ...base, contactCount: FREE_TIER_LIMIT - 1 })).toBeNull();
    expect(addContactBlock({ ...base, contactCount: FREE_TIER_LIMIT })).toBe("limit");
    expect(addContactBlock({ ...base, isPro: true, contactCount: 50 })).toBeNull();
  });

  it("keeps the Free limit while the status is unknown", () => {
    expect(addContactBlock({ ...base, isKnown: false, contactCount: FREE_TIER_LIMIT })).toBe("limit");
  });

  it("once a subscription is required, anyone without Pro or a trial is asked to subscribe", () => {
    const required = { ...base, subscriptionRequired: true };
    expect(addContactBlock(required)).toBe("subscription");
    expect(addContactBlock({ ...required, isPro: true, contactCount: 500 })).toBeNull();
  });

  it("does not flash the subscription wall while the status is loading", () => {
    expect(addContactBlock({ ...base, subscriptionRequired: true, isKnown: false })).toBeNull();
  });
});

describe("subscription plan and label", () => {
  const trial: ProStatus = { ...PRO, state: "trial", billingPeriod: "annual" };

  it("maps the server status to one plan", () => {
    expect(subscriptionPlanFor(undefined)).toBe("none");
    expect(subscriptionPlanFor(FREE)).toBe("none");
    expect(subscriptionPlanFor(trial)).toBe("trial");
    expect(subscriptionPlanFor(PRO)).toBe("monthly");
    expect(subscriptionPlanFor({ ...PRO, billingPeriod: "annual" })).toBe("annual");
    expect(subscriptionPlanFor({ ...FREE, state: "expired", billingPeriod: "monthly" })).toBe("expired");
  });

  it("counts trial days left, rounding up", () => {
    const now = Date.parse("2026-11-01T12:00:00Z");
    expect(daysLeft("2026-11-06T12:00:00Z", now)).toBe(5);
    expect(daysLeft("2026-11-01T13:00:00Z", now)).toBe(1);
    expect(daysLeft("2026-10-31T12:00:00Z", now)).toBe(0);
    expect(daysLeft(null, now)).toBeNull();
  });

  it("labels each plan", () => {
    expect(subscriptionLabel("trial", 5, true)).toBe("Free Trial · 5 days left");
    expect(subscriptionLabel("trial", 1, true)).toBe("Free Trial · 1 day left");
    expect(subscriptionLabel("trial", 0, true)).toBe("Free Trial · ends today");
    expect(subscriptionLabel("monthly", null, true)).toBe("Pro · Monthly");
    expect(subscriptionLabel("annual", null, true)).toBe("Pro · Yearly");
    expect(subscriptionLabel("expired", null, true)).toBe("Subscription ended");
    expect(subscriptionLabel("none", null, true)).toBe("Not subscribed");
    expect(subscriptionLabel("none", null, false)).toBe("Free Plan");
  });
});

describe("subscriptionGate (subscribe to start)", () => {
  const base = { subscriptionRequired: true, isKnown: true, isPro: false, path: "/dashboard" };

  it("is open for everyone while a subscription is not required", () => {
    expect(subscriptionGate({ ...base, subscriptionRequired: false })).toBe("open");
  });

  it("sends anyone without a trial or Pro to the subscription screen", () => {
    expect(subscriptionGate(base)).toBe("subscribe");
    expect(subscriptionGate({ ...base, path: "/contacts/42" })).toBe("subscribe");
    expect(subscriptionGate({ ...base, path: "/welcome" })).toBe("subscribe");
  });

  it("lets trial and Pro users in", () => {
    expect(subscriptionGate({ ...base, isPro: true })).toBe("open");
  });

  it("keeps the subscription screen and Settings (sign out, delete account) open", () => {
    expect(subscriptionGate({ ...base, path: SUBSCRIPTION_ROUTE })).toBe("open");
    expect(subscriptionGate({ ...base, path: "/settings" })).toBe("open");
    expect(subscriptionGate({ ...base, path: "/settingsx" })).toBe("subscribe");
  });

  it("waits, rather than flashing either screen, while the status loads", () => {
    expect(subscriptionGate({ ...base, isKnown: false })).toBe("wait");
  });
});

describe("subscriptionTerms", () => {
  it("states the trial, the price after it, renewal and how to cancel", () => {
    const text = subscriptionTerms({ priceString: "$4.99", period: "monthly", trialDays: 7 });
    expect(text).toContain("Free for 7 days, then $4.99 per month");
    expect(text).toContain("charged when the trial ends");
    expect(text).toContain("renews automatically every month");
    expect(text).toContain("Subscriptions");
  });

  it("drops the trial wording when Apple offers no trial", () => {
    const text = subscriptionTerms({ priceString: "$49.99", period: "annual", trialDays: 0 });
    expect(text).not.toContain("Free for");
    expect(text).toContain("$49.99 per year, charged to your Apple Account when you confirm");
  });
});

describe("annualSavingLabel", () => {
  it("works the saving out from the storefront's own prices, rounding down", () => {
    expect(annualSavingLabel(4.99, 49.99)).toBe("Save 16%");
    expect(annualSavingLabel(5.99, 59.99)).toBe("Save 16%");
    expect(annualSavingLabel(4.49, 44.99)).toBe("Save 16%");
    expect(annualSavingLabel(10, 60)).toBe("Save 50%");
  });

  it("shows no badge when a price is missing or yearly is not cheaper", () => {
    expect(annualSavingLabel(undefined, 49.99)).toBeNull();
    expect(annualSavingLabel(4.99, undefined)).toBeNull();
    expect(annualSavingLabel(4.99, 59.88)).toBeNull();
    expect(annualSavingLabel(4.99, 70)).toBeNull();
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
