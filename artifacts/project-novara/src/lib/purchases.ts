// ============================================================================
// Pure decisions for Novara Pro purchases. No React, no native calls, so each
// rule here can be tested directly.
// ============================================================================
import type { ProStatus } from "./api";
import type { ProPeriod } from "./nativeBridge";

/** The Novara Pro subscription screen (pages/Paywall.tsx). Settings and Add
 *  Contact link here. Keep this path stable: other screens depend on it. */
export const SUBSCRIPTION_ROUTE = "/pro";

/** Signed-in screens that stay open without a subscription. */
const GATE_EXEMPT_PATHS = [SUBSCRIPTION_ROUTE, "/settings"];

/** Apple's standard licensed application end user agreement. Linked from the
 *  paywall as the Terms of Use, which Apple requires for subscriptions. Replace
 *  it if Novara publishes its own terms (and update App Store Connect too). */
export const TERMS_OF_USE_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

/** Pro period and display text. The price itself always comes from Apple
 *  (ProductPrice.priceString); nothing here is a price. */
export const PRO_PERIOD_LABEL = { monthly: "per month", annual: "per year" } as const;

/** "billed monthly" / "billed yearly", for the line under the price. */
export const PRO_BILLED_LABEL = { monthly: "billed monthly", annual: "billed yearly" } as const;

/**
 * The badge beside the yearly plan, e.g. "Save 16%", worked out from the two
 * prices Apple returned for THIS storefront (never a fixed number, because
 * local prices differ by country). Rounded down so it never overstates.
 * Null, so no badge, when either price is missing or yearly is not cheaper.
 */
export function annualSavingLabel(monthlyPrice: number | undefined, annualPrice: number | undefined): string | null {
  if (!monthlyPrice || !annualPrice || monthlyPrice <= 0 || annualPrice <= 0) return null;
  const percent = Math.floor((1 - annualPrice / (monthlyPrice * 12)) * 100);
  return percent >= 1 ? `Save ${percent}%` : null;
}

/** How to cancel, in the words Apple's own Settings app uses. */
export const HOW_TO_CANCEL =
  "To cancel, open Settings on your iPhone, tap your name, then Subscriptions. Or tap Manage Subscription on this screen.";

/**
 * The full terms shown under the plans before purchase: price per period,
 * trial length and what happens after it, auto-renewal, and how to cancel.
 * Price and trial length always come from Apple (NativeProProduct), never a
 * constant. Confirm against current App Review guidance before submission
 * (see the setup doc).
 */
export function subscriptionTerms(input: { priceString: string; period: ProPeriod; trialDays: number }): string {
  const unit = input.period === "annual" ? "year" : "month";
  const price = `${input.priceString} per ${unit}`;
  const charge =
    input.trialDays > 0
      ? `Free for ${input.trialDays} days, then ${price}. Your Apple Account is charged when the trial ends unless you cancel at least 24 hours before it ends.`
      : `${price}, charged to your Apple Account when you confirm.`;
  return `${charge} The subscription renews automatically every ${unit} at the same price unless auto-renew is turned off at least 24 hours before the end of the current period. ${HOW_TO_CANCEL}`;
}

/** What happens to someone's contacts when a subscription ends. */
export const KEEP_YOUR_CONTACTS_NOTE =
  "If your subscription ends, your contacts are kept and come back as soon as you subscribe again.";

/**
 * What the app shows a signed-in user while a subscription is required.
 *  - "open": the requested screen.
 *  - "wait": nothing yet; the subscription status is still loading.
 *  - "subscribe": the subscription screen instead (SUBSCRIPTION_ROUTE).
 * Settings stays open so anyone can still sign out or delete their account
 * (Apple guideline 5.1.1(v)) without paying.
 */
export function subscriptionGate(input: {
  subscriptionRequired: boolean;
  isKnown: boolean;
  isPro: boolean;
  path: string;
}): "open" | "wait" | "subscribe" {
  if (!input.subscriptionRequired || input.isPro) return "open";
  if (GATE_EXEMPT_PATHS.some((p) => input.path === p || input.path.startsWith(`${p}/`))) return "open";
  return input.isKnown ? "subscribe" : "wait";
}

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

/** Calendar days from today until the day `expiresAt` falls on, in the
 *  user's own time zone: a trial ending tomorrow is 1, ending later today is
 *  0. Counted by date rather than by 24-hour blocks, so a clock change during
 *  the trial (a 7-day trial is 7 days and 1 hour across the end of daylight
 *  saving) can't make it read 8. Never negative; null without a date. */
export function daysLeft(expiresAt: string | null, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  const end = new Date(expiresAt);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date(now);
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const startDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((endDay - startDay) / 86_400_000));
}

/** "5 days left", "1 day left" or "ends today". */
export function trialTimeLeft(days: number): string {
  if (days <= 0) return "ends today";
  return `${days} ${days === 1 ? "day" : "days"} left`;
}

/** Short label for the plan, e.g. "Free Trial · 5 days left" or "Pro · Yearly". */
export function subscriptionLabel(
  plan: SubscriptionPlan,
  days: number | null,
  subscriptionRequired: boolean,
): string {
  switch (plan) {
    case "trial":
      return days === null ? "Free Trial" : `Free Trial · ${trialTimeLeft(days)}`;
    case "monthly":
      return "Pro · Monthly";
    case "annual":
      return "Pro · Yearly";
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
