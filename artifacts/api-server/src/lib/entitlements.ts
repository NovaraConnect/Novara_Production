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
// ============================================================================
import { pool } from "../db";

/** Novara Free ceiling. Pro removes it. */
export const FREE_TIER_LIMIT = 6;

/** RevenueCat entitlement identifier that grants Novara Pro. */
export const NOVARA_PRO_ENTITLEMENT = "novara_pro";

export interface ProStatus {
  pro: boolean;
  /** Where the access comes from. Null when not Pro. */
  source: "apple_iap" | null;
  /** ISO timestamp of the current period end, or null when not Pro. */
  expiresAt: string | null;
}

const NOT_PRO: ProStatus = { pro: false, source: null, expiresAt: null };

/** Whether the user holds an active Novara Pro entitlement right now. */
export async function proStatusFor(userId: string): Promise<ProStatus> {
  const { rows } = await pool.query<{ expires_at: Date }>(
    `SELECT expires_at
       FROM entitlements
      WHERE user_id = $1
        AND source = 'apple_iap'
        AND status = 'active'
        AND expires_at > now()
      LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return NOT_PRO;
  return { pro: true, source: "apple_iap", expiresAt: new Date(row.expires_at).toISOString() };
}

/**
 * The most contacts this user may hold. Infinity for Pro, otherwise the Free
 * ceiling. Callers compare counts against this; they must not hard-code 6.
 */
export async function contactLimitFor(userId: string): Promise<number> {
  const status = await proStatusFor(userId);
  return status.pro ? Infinity : FREE_TIER_LIMIT;
}
