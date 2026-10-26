// ============================================================================
// Pure decisions for Novara Pro purchases. No React, no native calls, so each
// rule here can be tested directly.
// ============================================================================
import type { ProStatus } from "./api";

/** Pro period and display text. The price itself always comes from Apple
 *  (ProductPrice.priceString); nothing here is a price. */
export const PRO_PERIOD_LABEL = { monthly: "per month", annual: "per year" } as const;

/** Shown beside the annual plan. Derived from the planned prices:
 *  1 − $49.99 / ($4.99 × 12) ≈ 16.5%, rounded down. If prices change, change
 *  this too (see docs/APPLE_IAP_SETUP.md). */
export const ANNUAL_SAVING_LABEL = "Save 16%";

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

/**
 * Whether the contact limit applies on screen. Pro removes it. While the
 * status is unknown we show the Free limit, which is also what the server
 * enforces, so an unknown status can never let a Free user past the ceiling.
 */
export function contactLimitApplies(status: { isKnown: boolean; isPro: boolean }): boolean {
  return status.isKnown ? !status.isPro : true;
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
