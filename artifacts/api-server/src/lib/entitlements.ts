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
// SUBSCRIBE TO START. There is no free plan: the web app shows the
// subscription screen in place of the app until the user has a trial or Pro,
// and this server refuses to add or import contacts without one. This does not
// depend on any switch. IAP_PAYWALL_ENABLED only decides whether
// purchase-capable app builds show the paywall.
// Nothing is deleted when a subscription ends. Account deletion and sign-out
// stay reachable without a subscription.
// ============================================================================
import { pool } from "../db";
import { logger } from "./logger";

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
  /**
   * While Pro: true if it renews at expiresAt, false if the user cancelled
   * (access ends at expiresAt), null if not known. Always null when not Pro.
   */
  willRenew: boolean | null;
}

const NOT_PRO: ProStatus = {
  pro: false,
  source: null,
  expiresAt: null,
  state: "none",
  billingPeriod: null,
  willRenew: null,
};

function flagOn(v: string | undefined): boolean {
  return !!v && ["1", "true", "on", "yes"].includes(v.trim().toLowerCase());
}

/** Whether the paywall may be shown in purchase-capable app builds. */
export function isPaywallEnabled(): boolean {
  return flagOn(process.env["IAP_PAYWALL_ENABLED"]);
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
  let rows: {
    status: string;
    expires_at: Date | null;
    product_id: string | null;
    period_type: string | null;
    will_renew: boolean | null;
  }[];
  try {
    ({ rows } = await pool.query(
      `SELECT status, expires_at, product_id, period_type, will_renew
         FROM entitlements
        WHERE user_id = $1
          AND source = 'apple_iap'
        LIMIT 1`,
      [userId],
    ));
  } catch (err) {
    // 42P01 = undefined_table, 42703 = undefined_column: this API was deployed
    // before migrations 0004 / 0007 / 0009. Nobody can have bought Pro yet, so answer
    // "not subscribed" instead of failing every contact creation. Any other
    // error still propagates.
    const code = (err as { code?: string }).code;
    if (code !== "42P01" && code !== "42703") throw err;
    logger.error(
      "entitlements schema missing; apply migrations 0004_apple_iap_entitlements.sql, 0007_entitlements_period_type.sql and 0009_entitlements_will_renew.sql",
    );
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
    willRenew: typeof row.will_renew === "boolean" ? row.will_renew : null,
  };
}

/** Whether this user may add or import contacts: Pro, trial included. */
export async function canAddContacts(userId: string): Promise<boolean> {
  return (await proStatusFor(userId)).pro;
}

/** The 403 body for an add or import refused by canAddContacts(). */
export const SUBSCRIPTION_REQUIRED_BODY = {
  error: "Subscription required",
  message: "Novara needs an active subscription. Start the 7-day free trial in the Novara iPhone app. Your existing contacts are kept.",
  code: "SUBSCRIPTION_REQUIRED",
} as const;
