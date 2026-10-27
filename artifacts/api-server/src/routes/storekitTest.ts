// ============================================================================
// LOCAL TESTING ONLY: lets the iOS simulator's Xcode StoreKit test purchases
// unlock Novara Pro on a local API.
//
// In production, Pro comes only from verified RevenueCat webhooks
// (routes/revenuecat.ts). Purchases made against an Xcode StoreKit
// configuration file never reach Apple or RevenueCat, so no webhook arrives.
// For local testing, the app's "StoreKit Test" scheme reports the simulator's
// current StoreKit entitlement here instead, and this writes the same
// `entitlements` row a webhook would.
//
// This trusts the client, so it refuses everything (404, as if it did not
// exist) unless ALL of these hold:
//   - IAP_LOCAL_STOREKIT_TEST is on,
//   - NODE_ENV is not "production",
//   - the process is not running on Render (Render sets RENDER on every service).
// Never set IAP_LOCAL_STOREKIT_TEST anywhere but a developer's own machine.
// ============================================================================
import { Router, type Request, type Response } from "express";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

export const STOREKIT_TEST_PATH = "/dev/storekit-test/entitlement";

function flagOn(v: string | undefined): boolean {
  return !!v && ["1", "true", "on", "yes"].includes(v.trim().toLowerCase());
}

/** Whether the local StoreKit test bridge is allowed in this process. */
export function isLocalStoreKitTestEnabled(): boolean {
  return (
    flagOn(process.env["IAP_LOCAL_STOREKIT_TEST"]) &&
    process.env["NODE_ENV"] !== "production" &&
    !process.env["RENDER"]
  );
}

const router = Router();

// POST /api/dev/storekit-test/entitlement
// Body: { active: boolean, productId: string | null, expiresAt: ISO string | null, isTrial: boolean }
router.post(STOREKIT_TEST_PATH, requireAuth, async (req: Request, res: Response) => {
  if (!isLocalStoreKitTestEnabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const productId = typeof body["productId"] === "string" ? body["productId"] : null;
  const expiresAt = typeof body["expiresAt"] === "string" ? new Date(body["expiresAt"]) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    res.status(400).json({ error: "expiresAt is not a date" });
    return;
  }
  const active = body["active"] === true && !!expiresAt && expiresAt.getTime() > Date.now();

  if (!productId) {
    // StoreKit has never seen a purchase for this simulator: nothing to record.
    res.json({ outcome: "ignored" });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO entitlements
         (user_id, source, provider_ref, product_id, status, expires_at, period_type, last_event_at, updated_at)
       VALUES ($1, 'apple_iap', 'xcode-storekit-test', $2, $3, $4, $5, now(), now())
       ON CONFLICT (user_id) WHERE source = 'apple_iap'
       DO UPDATE SET
         provider_ref  = EXCLUDED.provider_ref,
         product_id    = EXCLUDED.product_id,
         status        = EXCLUDED.status,
         expires_at    = EXCLUDED.expires_at,
         period_type   = EXCLUDED.period_type,
         last_event_at = EXCLUDED.last_event_at,
         updated_at    = now()`,
      [
        userId,
        productId,
        active ? "active" : "inactive",
        expiresAt ? expiresAt.toISOString() : null,
        body["isTrial"] === true ? "TRIAL" : "NORMAL",
      ],
    );
    logger.warn("Local StoreKit test entitlement written (development only)");
    res.json({ outcome: "applied" });
  } catch (err) {
    logger.error({ err }, "Local StoreKit test entitlement failed");
    res.status(500).json({ error: "Could not record test entitlement" });
  }
});

export default router;
