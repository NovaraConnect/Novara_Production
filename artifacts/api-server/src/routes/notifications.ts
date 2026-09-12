import { Router } from "express";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { sendPush, VAPID_PUBLIC_KEY, type StoredSubscription } from "../lib/push";
import { sendApns, isApnsConfigured, isApnsEnvironment, type ApnsEnvironment } from "../lib/apns";
import { chooseTransports } from "../lib/pushRouting";
import type { Request, Response } from "express";

const router = Router();

// GET /api/notifications/vapid-public-key — no auth, needed before permission prompt
router.get("/notifications/vapid-public-key", (_req: Request, res: Response) => {
  if (!VAPID_PUBLIC_KEY) {
    res.status(503).json({ error: "Push notifications not configured" });
    return;
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// GET /api/notifications/settings
router.get("/notifications/settings", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  try {
    const { rows: [row] } = await pool.query(
      `SELECT push_enabled, notify_due_today, notify_overdue, notify_status_change,
              notify_weekly_digest, reminder_time
       FROM user_settings WHERE user_id = $1`,
      [userId],
    );

    const defaults = {
      pushEnabled: false,
      notifyDueToday: true,
      notifyOverdue: true,
      notifyStatusChange: true,
      notifyWeeklyDigest: false,
      reminderTime: "09:00",
    };

    if (!row) {
      res.json(defaults);
      return;
    }

    res.json({
      pushEnabled: row.push_enabled ?? false,
      notifyDueToday: row.notify_due_today ?? true,
      notifyOverdue: row.notify_overdue ?? true,
      notifyStatusChange: row.notify_status_change ?? true,
      notifyWeeklyDigest: row.notify_weekly_digest ?? false,
      reminderTime: row.reminder_time ?? "09:00",
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch notification settings" });
  }
});

// PUT /api/notifications/settings
router.put("/notifications/settings", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const {
    pushEnabled,
    notifyDueToday,
    notifyOverdue,
    notifyStatusChange,
    notifyWeeklyDigest,
    reminderTime,
  } = req.body as {
    pushEnabled?: boolean;
    notifyDueToday?: boolean;
    notifyOverdue?: boolean;
    notifyStatusChange?: boolean;
    notifyWeeklyDigest?: boolean;
    reminderTime?: string;
  };

  try {
    await pool.query(
      `INSERT INTO user_settings (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );

    const { rows: [row] } = await pool.query(
      `UPDATE user_settings SET
         push_enabled            = COALESCE($2, push_enabled),
         notify_due_today        = COALESCE($3, notify_due_today),
         notify_overdue          = COALESCE($4, notify_overdue),
         notify_status_change    = COALESCE($5, notify_status_change),
         notify_weekly_digest    = COALESCE($6, notify_weekly_digest),
         reminder_time           = COALESCE($7, reminder_time),
         updated_at              = NOW()
       WHERE user_id = $1
       RETURNING push_enabled, notify_due_today, notify_overdue,
                 notify_status_change, notify_weekly_digest, reminder_time`,
      [
        userId,
        pushEnabled ?? null,
        notifyDueToday ?? null,
        notifyOverdue ?? null,
        notifyStatusChange ?? null,
        notifyWeeklyDigest ?? null,
        reminderTime ?? null,
      ],
    );

    res.json({
      pushEnabled: row.push_enabled,
      notifyDueToday: row.notify_due_today,
      notifyOverdue: row.notify_overdue,
      notifyStatusChange: row.notify_status_change,
      notifyWeeklyDigest: row.notify_weekly_digest,
      reminderTime: row.reminder_time,
    });
  } catch {
    res.status(500).json({ error: "Failed to update notification settings" });
  }
});

// POST /api/notifications/subscribe
router.post("/notifications/subscribe", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const { endpoint, keys } = req.body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "Invalid subscription object" });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, endpoint) DO UPDATE SET
         p256dh = $3, auth = $4`,
      [userId, endpoint, keys.p256dh, keys.auth],
    );

    await pool.query(
      `INSERT INTO user_settings (user_id, push_enabled)
       VALUES ($1, TRUE)
       ON CONFLICT (user_id) DO UPDATE SET push_enabled = TRUE, updated_at = NOW()`,
      [userId],
    );

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

// DELETE /api/notifications/subscribe
router.delete("/notifications/subscribe", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const { endpoint } = req.body as { endpoint?: string };

  try {
    if (endpoint) {
      await pool.query(
        "DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2",
        [userId, endpoint],
      );
    } else {
      await pool.query("DELETE FROM push_subscriptions WHERE user_id = $1", [userId]);
    }
    await pool.query(
      "UPDATE user_settings SET push_enabled = FALSE, updated_at = NOW() WHERE user_id = $1",
      [userId],
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to remove subscription" });
  }
});

// POST /api/notifications/apns-token — native iOS app registers its device token
router.post("/notifications/apns-token", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const { token, environment } = req.body as { token?: string; environment?: string };

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Missing device token" });
    return;
  }
  // Default to production: that is what TestFlight and App Store builds mint.
  const env: ApnsEnvironment = isApnsEnvironment(environment) ? environment : "production";

  try {
    await pool.query(
      `INSERT INTO apns_tokens (user_id, device_token, environment)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, device_token) DO UPDATE SET environment = $3`,
      [userId, token, env],
    );

    await pool.query(
      `INSERT INTO user_settings (user_id, push_enabled)
       VALUES ($1, TRUE)
       ON CONFLICT (user_id) DO UPDATE SET push_enabled = TRUE, updated_at = NOW()`,
      [userId],
    );

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save device token" });
  }
});

// DELETE /api/notifications/apns-token
router.delete("/notifications/apns-token", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const { token } = req.body as { token?: string };

  try {
    if (token) {
      await pool.query(
        "DELETE FROM apns_tokens WHERE user_id = $1 AND device_token = $2",
        [userId, token],
      );
    } else {
      await pool.query("DELETE FROM apns_tokens WHERE user_id = $1", [userId]);
    }

    // Only clear the global flag if the user has no remaining device at all,
    // otherwise unsubscribing on iPhone would silently kill PWA notifications.
    const { rows: [counts] } = await pool.query<{ web: string; apns: string }>(
      `SELECT
         (SELECT COUNT(*) FROM push_subscriptions WHERE user_id = $1) AS web,
         (SELECT COUNT(*) FROM apns_tokens        WHERE user_id = $1) AS apns`,
      [userId],
    );
    if (Number(counts.web) === 0 && Number(counts.apns) === 0) {
      await pool.query(
        "UPDATE user_settings SET push_enabled = FALSE, updated_at = NOW() WHERE user_id = $1",
        [userId],
      );
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to remove device token" });
  }
});

// POST /api/notifications/test
router.post("/notifications/test", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const payload = {
    title: "Novara Notifications",
    body: "Push notifications are working! You'll be reminded when contacts need attention.",
    tag: "test",
    url: "/notifications",
  };

  try {
    const { rows: webSubs } = await pool.query<StoredSubscription>(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
      [userId],
    );
    const { rows: apnsTokens } = await pool.query<{ device_token: string; environment: string }>(
      "SELECT device_token, environment FROM apns_tokens WHERE user_id = $1",
      [userId],
    );

    // Prefer native so a user with both the PWA and the iOS app installed is
    // not notified twice. See lib/pushRouting.ts.
    const transports = chooseTransports({
      apnsTokenCount: isApnsConfigured() ? apnsTokens.length : 0,
      webSubscriptionCount: webSubs.length,
    });

    if (transports.length === 0) {
      res.status(400).json({ error: "No active push subscriptions" });
      return;
    }

    let sent = 0;

    if (transports.includes("apns")) {
      for (const row of apnsTokens) {
        const environment = isApnsEnvironment(row.environment) ? row.environment : "production";
        const result = await sendApns({ deviceToken: row.device_token, environment }, payload);
        if (result === "ok") sent++;
        else {
          await pool
            .query("DELETE FROM apns_tokens WHERE device_token = $1", [row.device_token])
            .catch(() => {});
        }
      }
    }

    if (transports.includes("web")) {
      for (const sub of webSubs) {
        const result = await sendPush(sub, payload);
        if (result === "ok") sent++;
        else {
          await pool
            .query("DELETE FROM push_subscriptions WHERE endpoint = $1", [sub.endpoint])
            .catch(() => {});
        }
      }
    }

    if (sent === 0) {
      res.status(500).json({ error: "Failed to send test notification" });
      return;
    }
    res.json({ ok: true, sent });
  } catch {
    res.status(500).json({ error: "Failed to send test notification" });
  }
});

export default router;
