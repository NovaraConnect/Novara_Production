import { describe, it, expect } from "vitest";
import {
  annualSavingLabel,
  cancelledNotice,
  cancelledUntil,
  formatAccessDate,
  daysLeft,
  isPaywallVisible,
  needsSubscriptionToAdd,
  subscriptionGate,
  subscriptionLabel,
  subscriptionPlanFor,
  subscriptionTerms,
  SUBSCRIPTION_ROUTE,
  waitForPro,
} from "./purchases";
import type { ProStatus } from "./api";

const FREE: ProStatus = { pro: false, source: null, expiresAt: null, state: "none", billingPeriod: null, willRenew: null };
const PRO: ProStatus = {
  pro: true,
  source: "apple_iap",
  expiresAt: "2030-01-01T00:00:00.000Z",
  state: "active",
  billingPeriod: "monthly",
  willRenew: true,
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

describe("needsSubscriptionToAdd", () => {
  it("asks anyone without Pro or a trial to subscribe; there is no free allowance", () => {
    expect(needsSubscriptionToAdd({ isKnown: true, isPro: false })).toBe(true);
    expect(needsSubscriptionToAdd({ isKnown: true, isPro: true })).toBe(false);
  });

  it("does not flash the subscription wall while the status is loading", () => {
    expect(needsSubscriptionToAdd({ isKnown: false, isPro: false })).toBe(false);
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

  it("counts trial days left by calendar day in the user's time zone", () => {
    // Local dates, so the test holds in any time zone.
    const now = new Date(2026, 10, 1, 12, 0).getTime();
    expect(daysLeft(new Date(2026, 10, 6, 12, 0).toISOString(), now)).toBe(5);
    expect(daysLeft(new Date(2026, 10, 2, 9, 0).toISOString(), now)).toBe(1);
    expect(daysLeft(new Date(2026, 10, 1, 18, 0).toISOString(), now)).toBe(0);
    expect(daysLeft(new Date(2026, 9, 31, 12, 0).toISOString(), now)).toBe(0);
    expect(daysLeft(null, now)).toBeNull();
  });

  it("reads 7 for a 7-day trial even across a clock change", () => {
    // Started 27 Oct 14:58, ends 3 Nov 14:58: 7 days and 1 hour in New York,
    // where the clocks go back on 1 Nov. Used to show "8 days left".
    const start = new Date(2026, 9, 27, 14, 58).getTime();
    const end = new Date(2026, 10, 3, 14, 58).toISOString();
    expect(daysLeft(end, start)).toBe(7);
    expect(daysLeft(end, start + 60_000)).toBe(7);
  });

  it("labels each plan", () => {
    expect(subscriptionLabel("trial", 5)).toBe("Free Trial · 5 days left");
    expect(subscriptionLabel("trial", 1)).toBe("Free Trial · 1 day left");
    expect(subscriptionLabel("trial", 0)).toBe("Free Trial · ends today");
    expect(subscriptionLabel("monthly", null)).toBe("Pro · Monthly");
    expect(subscriptionLabel("annual", null)).toBe("Pro · Yearly");
    expect(subscriptionLabel("expired", null)).toBe("Subscription ended");
    expect(subscriptionLabel("none", null)).toBe("Not subscribed");
  });
});

describe("subscriptionGate (subscribe to start)", () => {
  const base = { isKnown: true, isPro: false, path: "/dashboard" };

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

describe("cancelled subscriptions (auto-renew off, access continues)", () => {
  const END = "2026-11-03T19:58:00.000Z";
  const trial: ProStatus = { ...PRO, state: "trial", expiresAt: END, willRenew: true };

  it("is cancelled only when the server says it won't renew and access continues", () => {
    expect(cancelledUntil({ ...trial, willRenew: false })).toBe(END);
    expect(cancelledUntil(trial)).toBeNull();
    // Unknown keeps today's wording.
    expect(cancelledUntil({ ...trial, willRenew: null })).toBeNull();
    // Not Pro: "Subscription ended" applies instead.
    expect(cancelledUntil({ ...FREE, state: "expired", willRenew: false })).toBeNull();
    expect(cancelledUntil(undefined)).toBeNull();
  });

  it("labels it 'Cancelled · access until <date>' for trial and paid plans", () => {
    expect(subscriptionLabel("trial", 7, "Nov 3")).toBe("Cancelled · access until Nov 3");
    expect(subscriptionLabel("monthly", null, "Nov 3")).toBe("Cancelled · access until Nov 3");
    expect(subscriptionLabel("annual", null, "Nov 3")).toBe("Cancelled · access until Nov 3");
    // Without a cancellation date the usual label stays.
    expect(subscriptionLabel("trial", 7, null)).toBe("Free Trial · 7 days left");
    expect(subscriptionLabel("expired", null, "Nov 3")).toBe("Subscription ended");
  });

  it("formats the date with a short or long month in the user's locale", () => {
    const local = new Date(2026, 10, 3, 12, 0).toISOString();
    expect(formatAccessDate(local, "short", "en-US")).toBe("Nov 3");
    expect(formatAccessDate(local, "long", "en-US")).toBe("November 3");
  });

  it("says plainly when access ends and that there is no charge", () => {
    expect(cancelledNotice({ isTrial: true, untilLong: "November 3" })).toBe(
      "You've cancelled. You keep Novara Pro until November 3, then the subscription ends. You won't be charged.",
    );
    expect(cancelledNotice({ isTrial: false, untilLong: "November 3" })).toContain("You won't be charged again.");
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
