// ============================================================================
// Pure decisions for Novara Pro purchases. No React, no native calls, so each
// rule here can be tested directly.
// ============================================================================
import type { ProStatus } from "./api";

/** The Novara Pro subscription screen (pages/Paywall.tsx). Settings and Add
 *  Contact link here. Keep this path stable: other screens depend on it. */
export const SUBSCRIPTION_ROUTE = "/pro";

/** Apple's standard licensed application end user agreement. Linked from the
 *  paywall as the Terms of Use, which Apple requires for subscriptions. Replace
 *  it if Novara publishes its own terms (and update App Store Connect too). */
export const TERMS_OF_USE_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

/** Pro period and display text. The price itself always comes from Apple
 *  (ProductPrice.priceString); nothing here is a price. */
export const PRO_PERIOD_LABEL = { monthly: "per month", annual: "per year" } as const;

/** Shown beside the annual plan. Derived from the planned prices:
 *  1 − $49.99 / ($4.99 × 12) ≈ 16.5%, rounded down. If prices change, change
 *  this too (see docs/APPLE_IAP_SETUP.md). */
export const ANNUAL_SAVING_LABEL = "Save 16%";

/** Free trial terms, shown with the plans whenever Apple offers this account a
 *  trial. `days` comes from Apple (NativeProProduct.trialDays), never a constant. */
export function trialNotice(days: number): string {
  return `The ${days}-day free trial starts when you confirm. Cancel at least 24 hours before it ends and you won't be charged. Otherwise your subscription starts automatically when the trial ends.`;
}

/** What happens to someone's contacts if they don't subscribe or stop. Matches
 *  what the server enforces: only adding and importing need Pro. */
export const KEEP_YOUR_CONTACTS_NOTE =
  "Your contacts stay yours. If you don't subscribe, or your subscription ends, you can still view, edit and follow up with every contact you've added.";

/** Apple's standard subscription terms, shown before purchase. Confirm against
 *  current App Review guidance before submission (see the setup doc). */
export const AUTO_RENEW_NOTICE =
  "Payment is charged to your Apple Account at confirmation of purchase. The subscription renews automatically unless auto-renew is turned off at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours before the end of the current period. You can manage or cancel the subscription in your Apple Account settings.";

/**
 * Whether the native paywall may be shown at all.
 *
 * All of these must hold:
 *  - the app is the native shell with a purchase-capable bridge (never a browser),
 *  - the server's applePaywall flag is on,
 *  - the user is not entitled through a university, who never see payment offers.
 */
export function isPaywallVisible(input: {
  nativePurchases: boolean;
  applePaywallFlag: boolean;
  universityEntitled: boolean;
}): boolean {
  return input.nativePurchases && input.applePaywallFlag && !input.universityEntitled;
}

/** Free ceiling while a subscription is not yet required (the server's
 *  FREE_TIER_LIMIT). Once it is required, there is no free allowance. */
export const FREE_TIER_LIMIT = 6;

/**
 * Why Add Contact cannot save right now, or null when it can.
 *
 *  - "subscription": a subscription is required and this user has neither Pro
 *    nor a trial. Shown only once the status is known, so a slow answer never
 *    flashes the wall at a subscriber; the server refuses the save regardless.
 *  - "limit": before a subscription is required, Free users at the ceiling.
 *    While the status is unknown the Free limit is assumed, as the server does.
 */
export function addContactBlock(input: {
  isKnown: boolean;
  isPro: boolean;
  subscriptionRequired: boolean;
  contactCount: number;
}): "subscription" | "limit" | null {
  if (input.subscriptionRequired) {
    return input.isKnown && !input.isPro ? "subscription" : null;
  }
  const limitApplies = input.isKnown ? !input.isPro : true;
  return limitApplies && input.contactCount >= FREE_TIER_LIMIT ? "limit" : null;
}

/** How this device can get Novara Pro: the paywall here, an app update first,
 *  or the iPhone app (from a browser). Null while Pro is not on sale at all. */
export type SubscribeRoute = "paywall" | "update-app" | "iphone-app" | null;

/** The words on Add Contact's wall for a given block. */
export function addContactWall(
  block: "subscription" | "limit",
  plan: SubscriptionPlan,
  route: SubscribeRoute,
): { title: string; message: string; action: string } {
  const how =
    route === "update-app" ? " Update Novara from the App Store to subscribe."
    : route === "iphone-app" ? " You can subscribe in the Novara app on iPhone."
    : "";
  if (block === "limit") {
    return {
      title: "You've reached the contact limit",
      message: `Novara Free includes up to ${FREE_TIER_LIMIT} contacts. Novara Pro removes the limit.${how}`,
      action: "See Novara Pro",
    };
  }
  if (plan === "expired") {
    return {
      title: "Your Novara Pro has ended",
      message: `Subscribe again to add new contacts. Everything you've already added is still here.${how}`,
      action: "See plans",
    };
  }
  return {
    title: "Add contacts with Novara Pro",
    message: `Novara Pro lets you add and import contacts without a limit. New subscribers can try it free for 7 days.${how}`,
    action: "See Novara Pro",
  };
}

/** One value for "what plan is this user on", for labels such as the Settings row. */
export type SubscriptionPlan = "trial" | "monthly" | "annual" | "expired" | "none";

export function subscriptionPlanFor(status: ProStatus | undefined): SubscriptionPlan {
  if (!status) return "none";
  if (status.pro) {
    if (status.state === "trial") return "trial";
    // Pro has exactly two products; an unrecognised one is billed monthly.
    return status.billingPeriod === "annual" ? "annual" : "monthly";
  }
  return status.state === "expired" ? "expired" : "none";
}

/** Whole days until `expiresAt`, rounded up (so "ends tomorrow" is 1), never
 *  negative. Null without a date. */
export function daysLeft(expiresAt: string | null, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** "5 days left", "1 day left" or "ends today". */
export function trialTimeLeft(days: number): string {
  if (days <= 0) return "ends today";
  return `${days} ${days === 1 ? "day" : "days"} left`;
}

/** Short label for the plan, e.g. "Free trial · 5 days left" or "Novara Pro · Annual". */
export function subscriptionLabel(
  plan: SubscriptionPlan,
  days: number | null,
  subscriptionRequired: boolean,
): string {
  switch (plan) {
    case "trial":
      return days === null ? "Free trial" : `Free trial · ${trialTimeLeft(days)}`;
    case "monthly":
      return "Novara Pro · Monthly";
    case "annual":
      return "Novara Pro · Annual";
    case "expired":
      return "Subscription ended";
    case "none":
      return subscriptionRequired ? "Not subscribed" : "Free Plan";
  }
}

/**
 * Polls the server until it reports Pro, or gives up. Used after a purchase
 * because the RevenueCat webhook can arrive a few seconds after Apple confirms
 * the purchase. Errors count as "not yet" and are retried.
 */
export async function waitForPro(
  read: () => Promise<ProStatus>,
  options: {
    attempts?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<boolean> {
  const attempts = options.attempts ?? 10;
  const intervalMs = options.intervalMs ?? 2000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let i = 0; i < attempts; i++) {
    try {
      const status = await read();
      if (status.pro) return true;
    } catch {
      // Not yet. The next attempt tries again.
    }
    if (i < attempts - 1) await sleep(intervalMs);
  }
  return false;
}
