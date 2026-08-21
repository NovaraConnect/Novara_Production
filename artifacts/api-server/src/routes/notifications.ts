import { Router } from "express";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { sendPush, VAPID_PUBLIC_KEY, type StoredSubscription } from "../lib/push";
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

// POST /api/notifications/test
router.post("/notifications/test", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  try {
    const { rows: subs } = await pool.query<StoredSubscription>(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
      [userId],
    );

    if (subs.length === 0) {
      res.status(400).json({ error: "No active push subscriptions" });
      return;
    }

    let sent = 0;
    for (const sub of subs) {
      const result = await sendPush(sub, {
        title: "Novara Notifications",
        body: "Push notifications are working! You'll be reminded when contacts need attention.",
        tag: "test",
        url: "/notifications",
      });
      if (result === "ok") sent++;
      else if (result === "gone") {
        await pool.query(
          "DELETE FROM push_subscriptions WHERE endpoint = $1",
          [sub.endpoint],
        ).catch(() => {});
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
