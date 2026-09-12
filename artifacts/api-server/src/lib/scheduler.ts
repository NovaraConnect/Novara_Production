import cron from "node-cron";
import { pool } from "../db";
import { sendPush, type StoredSubscription } from "./push";
import { sendApns, isApnsConfigured, isApnsEnvironment } from "./apns";
import { chooseTransports } from "./pushRouting";
import { logger } from "./logger";

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

async function runDailyNotifications(): Promise<void> {
  logger.info("Running daily notification check");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  try {
    const { rows: users } = await pool.query<{
      user_id: string;
      notify_due_today: boolean;
      notify_overdue: boolean;
      notify_status_change: boolean;
    }>(`
      SELECT user_id, notify_due_today, notify_overdue, notify_status_change
      FROM user_settings
      WHERE push_enabled = TRUE
    `);

    for (const user of users) {
      const { rows: subs } = await pool.query<StoredSubscription>(
        "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
        [user.user_id],
      );
      const { rows: apnsRows } = await pool.query<{ device_token: string; environment: string }>(
        "SELECT device_token, environment FROM apns_tokens WHERE user_id = $1",
        [user.user_id],
      );

      // Prefer native when the user has the iOS app, so someone running both
      // the PWA and the App Store build is not notified twice.
      const transports = chooseTransports({
        apnsTokenCount: isApnsConfigured() ? apnsRows.length : 0,
        webSubscriptionCount: subs.length,
      });
      if (transports.length === 0) continue;

      const { rows: contacts } = await pool.query<{
        id: string;
        first_name: string;
        last_name: string;
        next_follow_up_date: Date;
        follow_up_cadence_days: number;
      }>(
        `SELECT id, first_name, last_name, next_follow_up_date, follow_up_cadence_days
         FROM contacts WHERE user_id = $1`,
        [user.user_id],
      );

      const notifications: { title: string; body: string; tag: string; url: string }[] = [];

      if (user.notify_due_today) {
        const dueToday = contacts.filter(
          (c) => new Date(c.next_follow_up_date).toISOString().split("T")[0] === todayStr,
        );
        if (dueToday.length === 1) {
          notifications.push({
            title: "Follow-up due today",
            body: `${dueToday[0].first_name} ${dueToday[0].last_name} is due for a follow-up today.`,
            tag: `due-${dueToday[0].id}`,
            url: `/contacts/${dueToday[0].id}`,
          });
        } else if (dueToday.length > 1) {
          notifications.push({
            title: `${dueToday.length} follow-ups due today`,
            body: `You have ${dueToday.length} contacts due for follow-ups today.`,
            tag: "due-many",
            url: "/dashboard",
          });
        }
      }

      if (user.notify_overdue) {
        const overdue = contacts.filter((c) => {
          const nfd = new Date(c.next_follow_up_date);
          nfd.setHours(0, 0, 0, 0);
          return nfd < today;
        });
        if (overdue.length === 1) {
          notifications.push({
            title: "Overdue follow-up",
            body: `${overdue[0].first_name} ${overdue[0].last_name} is overdue for a follow-up.`,
            tag: "overdue-single",
            url: `/contacts/${overdue[0].id}`,
          });
        } else if (overdue.length > 1) {
          notifications.push({
            title: `${overdue.length} overdue contacts`,
            body: `You have ${overdue.length} overdue contacts. Don't let them go cold.`,
            tag: "overdue-many",
            url: "/dashboard",
          });
        }
      }

      if (user.notify_status_change) {
        for (const c of contacts) {
          const nfd = new Date(c.next_follow_up_date);
          nfd.setHours(0, 0, 0, 0);
          const daysOverdue = daysBetween(nfd, today);
          if (daysOverdue === 1) {
            notifications.push({
              title: "Contact warming down",
              body: `${c.first_name} ${c.last_name} missed their follow-up — they're now cooling.`,
              tag: `cooling-${c.id}`,
              url: `/contacts/${c.id}`,
            });
          } else if (daysOverdue === c.follow_up_cadence_days) {
            notifications.push({
              title: "Contact went cold",
              body: `${c.first_name} ${c.last_name} has gone cold. Time to reconnect!`,
              tag: `cold-${c.id}`,
              url: `/contacts/${c.id}`,
            });
          }
        }
      }

      const toSend = notifications.slice(0, 5);
      for (const notif of toSend) {
        if (transports.includes("apns")) {
          for (const row of apnsRows) {
            const environment = isApnsEnvironment(row.environment) ? row.environment : "production";
            const result = await sendApns(
              { deviceToken: row.device_token, environment },
              notif,
            );
            if (result === "gone") {
              await pool
                .query("DELETE FROM apns_tokens WHERE device_token = $1", [row.device_token])
                .catch(() => {});
            }
          }
        }

        if (transports.includes("web")) {
          for (const sub of subs) {
            const result = await sendPush(sub, notif);
            if (result === "gone") {
              await pool
                .query("DELETE FROM push_subscriptions WHERE endpoint = $1", [sub.endpoint])
                .catch(() => {});
            }
          }
        }
      }

      if (toSend.length > 0) {
        logger.info({ userId: user.user_id, sent: toSend.length }, "Sent notifications");
      }
    }
  } catch (err) {
    logger.error({ err }, "Notification scheduler error");
  }
}

export function startScheduler(): void {
  const webConfigured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  const nativeConfigured = isApnsConfigured();

  // Previously this required VAPID specifically. With a second transport the
  // gate is "at least one way to reach anyone" — otherwise an APNs-only
  // deployment would start up with the scheduler silently disabled.
  if (!webConfigured && !nativeConfigured) {
    logger.warn("Neither VAPID nor APNs configured — notification scheduler disabled");
    return;
  }
  cron.schedule("0 9 * * *", runDailyNotifications, { timezone: "UTC" });
  logger.info("Notification scheduler started (daily at 09:00 UTC)");
}
