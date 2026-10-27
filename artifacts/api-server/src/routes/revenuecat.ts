// ============================================================================
// RevenueCat webhook — the ONLY writer of Apple-sourced entitlements.
//
// VERIFICATION. RevenueCat sends the Authorization header value you configure
// in its dashboard on every delivery. We compare it to REVENUECAT_WEBHOOK_AUTH
// in constant time (both sides hashed, so lengths do not leak). If the secret
// is unset the endpoint refuses everything (503) rather than accepting
// unauthenticated writes.
//
// IDEMPOTENCY. Each event's id is inserted into revenuecat_events in the same
// transaction as the entitlement change. A redelivered event hits the primary
// key and changes nothing. A crash rolls both back, so RevenueCat's retry
// applies the change exactly once.
//
// ORDERING. Deliveries can arrive out of order. An event only changes the
// entitlement if its event_timestamp is not older than the last one applied.
//
// NO GRACE. Access is granted until Apple's expiration_at_ms and no longer.
//
// TRIALS. The 7-day free trial is an Apple introductory offer. Its events carry
// period_type TRIAL and grant Pro like a paid period; the period type is kept
// so the app can say "Free trial, 3 days left". Converting to paid arrives as a
// RENEWAL with period_type NORMAL; a trial cancelled in time ends in EXPIRATION.
//
// TRANSFER. When an Apple Account that already paid restores purchases while
// signed in to a different Novara account, RevenueCat moves the subscription
// and sends TRANSFER (which has no app_user_id). We move the Apple row to the
// new owner and switch the old owner's row off.
// ============================================================================
import { Router, type Request, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { logger } from "../lib/logger";
import { NOVARA_PRO_ENTITLEMENT } from "../lib/entitlements";

export const REVENUECAT_WEBHOOK_PATH = "/webhooks/revenuecat";

export interface RevenueCatEvent {
  id: string;
  type: string;
  /** Absent on TRANSFER events, which use transferred_from / transferred_to. */
  app_user_id: string;
  cancel_reason?: string | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
  product_id?: string | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  /** TRIAL, INTRO, NORMAL, PROMOTIONAL or PREPAID. */
  period_type?: string | null;
  event_timestamp_ms: number;
  environment?: string | null;
  original_transaction_id?: string | null;
}

/** Clerk user IDs. RevenueCat anonymous IDs ("$RCAnonymousID:…") never match,
 *  so an unidentified purchase cannot grant access to anyone. */
const CLERK_USER_ID = /^user_[A-Za-z0-9_-]+$/;

/** Events after which Novara Pro is granted until expiration_at_ms. */
const GRANTING = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "CANCELLATION", // still active until the period ends (refunds excepted, below)
  "BILLING_ISSUE", // Apple's own retry window; access ends at expiration
  "SUBSCRIPTION_EXTENDED", // Apple pushed the expiry back
  "REFUND_REVERSED",
  "TEMPORARY_ENTITLEMENT_GRANT", // short grant during an App Store outage
]);

/** cancel_reason RevenueCat sends with CANCELLATION when Apple refunded the period. */
const REFUND_REASON = "CUSTOMER_SUPPORT";

/** Events after which Novara Pro is no longer granted. */
const ENDING = new Set(["EXPIRATION"]);

export type Outcome = "applied" | "duplicate" | "ignored";

/** Constant-time check of the Authorization header against the configured secret. */
export function isAuthorised(presented: string | undefined, expected: string | undefined): boolean {
  if (!expected || !presented) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Pure decision: what an event means for the novara_pro entitlement, if anything. */
export function entitlementChangeFor(event: RevenueCatEvent):
  | {
      active: boolean;
      expiresAt: Date | null;
      productId: string | null;
      providerRef: string | null;
      periodType: string | null;
    }
  | null {
  if (!CLERK_USER_ID.test(event.app_user_id)) return null;
  const ids = Array.isArray(event.entitlement_ids) ? event.entitlement_ids : [];
  if (!ids.includes(NOVARA_PRO_ENTITLEMENT)) return null;

  const expiresAt = typeof event.expiration_at_ms === "number" ? new Date(event.expiration_at_ms) : null;
  const productId = event.product_id ?? null;
  const providerRef = event.original_transaction_id ?? null;
  const periodType = typeof event.period_type === "string" ? event.period_type : null;

  if (ENDING.has(event.type) || (event.type === "CANCELLATION" && event.cancel_reason === REFUND_REASON)) {
    return { active: false, expiresAt, productId, providerRef, periodType };
  }
  if (GRANTING.has(event.type)) {
    // A grant without an end date is not one we will honour.
    if (!expiresAt) return null;
    return { active: true, expiresAt, productId, providerRef, periodType };
  }
  // TEST, PRODUCT_CHANGE without expiry, and anything new: recorded, not acted on.
  // TRANSFER is handled separately (applyTransfer).
  return null;
}

const clerkIds = (ids: unknown): string[] =>
  Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && CLERK_USER_ID.test(id)) : [];

/** The Clerk user a TRANSFER moves the subscription to, if any. */
function transferTarget(event: RevenueCatEvent): string | null {
  return clerkIds(event.transferred_to)[0] ?? null;
}

/**
 * Moves the Apple entitlement from the transferred_from users to the
 * transferred_to user, inside the caller's transaction. The new owner gets the
 * old owner's expiry; the old owner's row is switched off. Ordering is
 * respected on both sides through last_event_at.
 */
async function applyTransfer(client: PoolClient, event: RevenueCatEvent): Promise<Outcome> {
  const to = transferTarget(event);
  const from = clerkIds(event.transferred_from).filter((id) => id !== to);
  if (!to || from.length === 0) return "ignored";
  const eventAt = new Date(event.event_timestamp_ms).toISOString();

  const { rows } = await client.query<{
    provider_ref: string | null;
    product_id: string | null;
    status: string;
    expires_at: Date | null;
    period_type: string | null;
  }>(
    `SELECT provider_ref, product_id, status, expires_at, period_type
       FROM entitlements
      WHERE source = 'apple_iap' AND user_id = ANY($1)
        AND (last_event_at IS NULL OR last_event_at <= $2)
      ORDER BY (status = 'active') DESC, expires_at DESC NULLS LAST
      LIMIT 1
      FOR UPDATE`,
    [from, eventAt],
  );
  const moved = rows[0];
  if (!moved) return "ignored";

  await client.query(
    `UPDATE entitlements
        SET status = 'inactive', last_event_at = $2, updated_at = now()
      WHERE source = 'apple_iap' AND user_id = ANY($1)
        AND (last_event_at IS NULL OR last_event_at <= $2)`,
    [from, eventAt],
  );
  await client.query(
    `INSERT INTO entitlements
       (user_id, source, provider_ref, product_id, status, expires_at, period_type, last_event_at, updated_at)
     VALUES ($1, 'apple_iap', $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (user_id) WHERE source = 'apple_iap'
     DO UPDATE SET
       provider_ref  = EXCLUDED.provider_ref,
       product_id    = EXCLUDED.product_id,
       status        = EXCLUDED.status,
       expires_at    = EXCLUDED.expires_at,
       period_type   = EXCLUDED.period_type,
       last_event_at = EXCLUDED.last_event_at,
       updated_at    = now()
     WHERE entitlements.last_event_at IS NULL
        OR entitlements.last_event_at <= EXCLUDED.last_event_at`,
    [to, moved.provider_ref, moved.product_id, moved.status, moved.expires_at, moved.period_type, eventAt],
  );
  return "applied";
}

async function applyEvent(event: RevenueCatEvent): Promise<Outcome> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO revenuecat_events (event_id, event_type, app_user_id, environment, event_timestamp)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        event.id,
        event.type,
        event.app_user_id ?? transferTarget(event) ?? "",
        event.environment ?? null,
        new Date(event.event_timestamp_ms).toISOString(),
      ],
    );
    if (inserted.rowCount === 0) {
      await client.query("COMMIT");
      return "duplicate";
    }

    if (event.type === "TRANSFER") {
      const outcome = await applyTransfer(client, event);
      await client.query("COMMIT");
      return outcome;
    }

    const change = entitlementChangeFor(event);
    if (!change) {
      await client.query("COMMIT");
      return "ignored";
    }

    const eventAt = new Date(event.event_timestamp_ms).toISOString();
    const upsert = await client.query(
      `INSERT INTO entitlements
         (user_id, source, provider_ref, product_id, status, expires_at, period_type, last_event_at, updated_at)
       VALUES ($1, 'apple_iap', $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (user_id) WHERE source = 'apple_iap'
       DO UPDATE SET
         provider_ref  = EXCLUDED.provider_ref,
         product_id    = EXCLUDED.product_id,
         status        = EXCLUDED.status,
         expires_at    = EXCLUDED.expires_at,
       period_type   = EXCLUDED.period_type,
         last_event_at = EXCLUDED.last_event_at,
         updated_at    = now()
       WHERE entitlements.last_event_at IS NULL
          OR entitlements.last_event_at <= EXCLUDED.last_event_at`,
      [
        event.app_user_id,
        change.providerRef,
        change.productId,
        change.active ? "active" : "inactive",
        change.expiresAt ? change.expiresAt.toISOString() : null,
        change.periodType,
        eventAt,
      ],
    );
    await client.query("COMMIT");
    // rowCount 0 means an older event than the one already applied.
    return upsert.rowCount === 0 ? "ignored" : "applied";
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

const router = Router();

router.post(REVENUECAT_WEBHOOK_PATH, async (req: Request, res: Response) => {
  const expected = process.env["REVENUECAT_WEBHOOK_AUTH"];
  if (!expected) {
    logger.error("REVENUECAT_WEBHOOK_AUTH is not set; refusing RevenueCat webhook");
    res.status(503).json({ error: "Webhook not configured" });
    return;
  }
  if (!isAuthorised(req.get("authorization"), expected)) {
    logger.warn("RevenueCat webhook rejected: bad authorization");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const event = req.body?.event as Partial<RevenueCatEvent> | undefined;
  if (
    !event ||
    typeof event.id !== "string" ||
    typeof event.type !== "string" ||
    (typeof event.app_user_id !== "string" && event.type !== "TRANSFER") ||
    typeof event.event_timestamp_ms !== "number"
  ) {
    res.status(400).json({ error: "Malformed event" });
    return;
  }

  try {
    const outcome = await applyEvent(event as RevenueCatEvent);
    logger.info({ eventType: event.type, outcome }, "RevenueCat event processed");
    res.status(200).json({ outcome });
  } catch (err) {
    // 500 makes RevenueCat retry, which is what we want for a transient failure.
    logger.error({ err, eventType: event.type }, "RevenueCat event failed");
    res.status(500).json({ error: "Could not process event" });
  }
});

export default router;
