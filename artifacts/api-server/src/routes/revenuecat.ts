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
  app_user_id: string;
  product_id?: string | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
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
  "CANCELLATION", // still active until the period ends
  "BILLING_ISSUE", // Apple's own retry window; access ends at expiration
]);

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
  | { active: boolean; expiresAt: Date | null; productId: string | null; providerRef: string | null }
  | null {
  if (!CLERK_USER_ID.test(event.app_user_id)) return null;
  const ids = Array.isArray(event.entitlement_ids) ? event.entitlement_ids : [];
  if (!ids.includes(NOVARA_PRO_ENTITLEMENT)) return null;

  const expiresAt = typeof event.expiration_at_ms === "number" ? new Date(event.expiration_at_ms) : null;
  const productId = event.product_id ?? null;
  const providerRef = event.original_transaction_id ?? null;

  if (ENDING.has(event.type)) {
    return { active: false, expiresAt, productId, providerRef };
  }
  if (GRANTING.has(event.type)) {
    // A grant without an end date is not one we will honour.
    if (!expiresAt) return null;
    return { active: true, expiresAt, productId, providerRef };
  }
  // TEST, TRANSFER, SUBSCRIPTION_PAUSED and anything new: recorded, not acted on.
  return null;
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
        event.app_user_id,
        event.environment ?? null,
        new Date(event.event_timestamp_ms).toISOString(),
      ],
    );
    if (inserted.rowCount === 0) {
      await client.query("COMMIT");
      return "duplicate";
    }

    const change = entitlementChangeFor(event);
    if (!change) {
      await client.query("COMMIT");
      return "ignored";
    }

    const eventAt = new Date(event.event_timestamp_ms).toISOString();
    const upsert = await client.query(
      `INSERT INTO entitlements
         (user_id, source, provider_ref, product_id, status, expires_at, last_event_at, updated_at)
       VALUES ($1, 'apple_iap', $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id) WHERE source = 'apple_iap'
       DO UPDATE SET
         provider_ref  = EXCLUDED.provider_ref,
         product_id    = EXCLUDED.product_id,
         status        = EXCLUDED.status,
         expires_at    = EXCLUDED.expires_at,
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
    typeof event.app_user_id !== "string" ||
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
