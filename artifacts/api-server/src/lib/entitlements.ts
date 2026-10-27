// ============================================================================
// Server-side entitlement read model.
//
// THE SERVER DECIDES WHO IS PRO. The client never does: it may display what
// this module reports, and a purchase result from StoreKit is never treated as
// proof of anything. Access comes only from rows written by verified provider
// events (see routes/revenuecat.ts).
//
// Read-time check: a row grants access only while status = 'active' AND its
// expiry is still in the future. A missed EXPIRATION event therefore cannot
// leave someone with access.
//
// PRICING. One plan, Novara Pro, monthly or annual, each with a 7-day free
// trial that Apple runs (an introductory offer). A trial is an active Apple
// subscription whose RevenueCat period_type is TRIAL, so it grants Pro exactly
// like a paid period.
//
// SUBSCRIBE TO START. Two switches on the API:
//   - IAP_PAYWALL_ENABLED shows the paywall in purchase-capable app builds.
//   - IAP_SUBSCRIPTION_REQUIRED (only with the paywall on) means there is no
//     free plan: the web app shows the subscription screen in place of the app
//     until the user has a trial or Pro, and this server refuses to add or
//     import contacts without one. Without it the old Free ceiling applies.
// Nothing is deleted when a subscription ends. Account deletion and sign-out
// stay reachable without a subscription.
// ============================================================================
import { pool } from "../db";
import { logger } from "./logger";

/** Free ceiling used while a subscription is not yet required. Pro removes it. */
export const FREE_TIER_LIMIT = 6;

/** RevenueCat entitlement identifier that grants Novara Pro. */
export const NOVARA_PRO_ENTITLEMENT = "novara_pro";

/**
 * Where the user stands, for display:
 *  - "trial": inside Apple's free trial,
 *  - "active": a paid Pro period,
 *  - "expired": had Pro or a trial, and it has ended (or was refunded or moved),
 *  - "none": never subscribed.
 */
export type SubscriptionState = "trial" | "active" | "expired" | "none";

export type BillingPeriod = "monthly" | "annual";

export interface ProStatus {
  /** True during a trial or a paid period. This is what unlocks adding contacts. */
  pro: boolean;
  /** Where the access comes from. Null when not Pro. */
  source: "apple_iap" | null;
  /** ISO timestamp of the current period end (the trial end during a trial), or null when not Pro. */
  expiresAt: string | null;
  state: SubscriptionState;
  /** The plan chosen, from the Apple product. During a trial, the plan it turns into. */
  billingPeriod: BillingPeriod | null;
}

const NOT_PRO: ProStatus = { pro: false, source: null, expiresAt: null, state: "none", billingPeriod: null };

function flagOn(v: string | undefined): boolean {
  return !!v && ["1", "true", "on", "yes"].includes(v.trim().toLowerCase());
}

/** Whether the paywall may be shown in purchase-capable app builds. */
export function isPaywallEnabled(): boolean {
  return flagOn(process.env["IAP_PAYWALL_ENABLED"]);
}

/**
 * Whether adding contacts needs Pro or a trial. Only honoured while the paywall
 * is on too, so nobody can be asked to pay where they cannot buy, and removing
 * IAP_PAYWALL_ENABLED switches the whole thing off at once.
 */
export function isSubscriptionRequired(): boolean {
  return isPaywallEnabled() && flagOn(process.env["IAP_SUBSCRIPTION_REQUIRED"]);
}

/** Monthly or annual, from the App Store product ID (…pro.monthly / …pro.annual). */
export function billingPeriodFor(productId: string | null): BillingPeriod | null {
  if (!productId) return null;
  if (productId.endsWith(".annual")) return "annual";
  if (productId.endsWith(".monthly")) return "monthly";
  return null;
}

/** The user's Novara Pro status right now. */
export async function proStatusFor(userId: string): Promise<ProStatus> {
  let rows: { status: string; expires_at: Date | null; product_id: string | null; period_type: string | null }[];
  try {
    ({ rows } = await pool.query(
      `SELECT status, expires_at, product_id, period_type
         FROM entitlements
        WHERE user_id = $1
          AND source = 'apple_iap'
        LIMIT 1`,
      [userId],
    ));
  } catch (err) {
    // 42P01 = undefined_table, 42703 = undefined_column: this API was deployed
    // before migrations 0004 / 0007. Nobody can have bought Pro yet, so answer
    // "not subscribed" instead of failing every contact creation. Any other
    // error still propagates.
    const code = (err as { code?: string }).code;
    if (code !== "42P01" && code !== "42703") throw err;
    logger.error("entitlements schema missing; apply migrations 0004_apple_iap_entitlements.sql and 0007_entitlements_period_type.sql");
    return NOT_PRO;
  }
  const row = rows[0];
  if (!row) return NOT_PRO;

  const billingPeriod = billingPeriodFor(row.product_id);
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  if (row.status !== "active" || !expiresAt || expiresAt.getTime() <= Date.now()) {
    return { ...NOT_PRO, state: "expired", billingPeriod };
  }
  return {
    pro: true,
    source: "apple_iap",
    expiresAt: expiresAt.toISOString(),
    state: row.period_type === "TRIAL" ? "trial" : "active",
    billingPeriod,
  };
}

/**
 * The most contacts this user may hold. Infinity for Pro (trial included).
 * Otherwise zero while a subscription is required, or the Free ceiling before
 * that. Callers compare counts against this; they must not hard-code a number.
 */
export async function contactLimitFor(userId: string): Promise<number> {
  const status = await proStatusFor(userId);
  if (status.pro) return Infinity;
  return isSubscriptionRequired() ? 0 : FREE_TIER_LIMIT;
}

/** The 403 body for an add or import refused by contactLimitFor(). */
export function limitReachedBody(): { error: string; message: string; code: string } {
  if (isSubscriptionRequired()) {
    return {
      error: "Subscription required",
      message: "Novara needs an active subscription. Start the 7-day free trial in the Novara iPhone app. Your existing contacts are kept.",
      code: "SUBSCRIPTION_REQUIRED",
    };
  }
  return {
    error: "Contact limit reached",
    message: `Novara Free includes up to ${FREE_TIER_LIMIT} contacts. Novara Pro removes the limit.`,
    code: "CONTACT_LIMIT_REACHED",
  };
}
