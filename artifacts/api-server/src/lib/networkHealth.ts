import cron from "node-cron";
import { pool } from "../db";
import { logger } from "./logger";

/**
 * Network Health history: one score per user per day, used for the
 * Dashboard's "+12 vs last month" badge.
 *
 * The score mirrors computeHealthScore in the web app: over connected
 * contacts, 100 while a follow-up is not yet due, 60 when 1-30 days overdue,
 * 20 when 31-90 days, 0 beyond that. Days are counted in UTC here and in the
 * user's time zone in the app, which can differ by a day at the edges; that
 * is fine for a month-on-month trend.
 */
const SCORE_SQL = `
  SELECT user_id,
         CURRENT_DATE,
         ROUND(AVG(CASE
           WHEN CURRENT_DATE - next_follow_up_date <= 0  THEN 100
           WHEN CURRENT_DATE - next_follow_up_date <= 30 THEN 60
           WHEN CURRENT_DATE - next_follow_up_date <= 90 THEN 20
           ELSE 0 END))::int AS score
    FROM contacts
   WHERE connection_status = 'connected'
`;

let tableReady: boolean | null = null;

/** Until migration 0005 runs there is no table, and everything here no-ops. */
async function hasTable(): Promise<boolean> {
  if (tableReady) return true;
  const { rows } = await pool.query<{ t: string | null }>(
    "SELECT to_regclass('public.network_health_snapshots')::text AS t",
  );
  tableReady = rows[0]?.t != null;
  return tableReady;
}

/** Records today's score for one user, or for everyone when userId is omitted. */
export async function recordHealthSnapshots(userId?: string): Promise<void> {
  if (!(await hasTable())) return;
  const where = userId ? "AND user_id = $1" : "";
  await pool.query(
    `INSERT INTO network_health_snapshots (user_id, snapshot_date, score)
     ${SCORE_SQL} ${where}
     GROUP BY user_id
     ON CONFLICT (user_id, snapshot_date) DO UPDATE SET score = EXCLUDED.score`,
    userId ? [userId] : [],
  );
}

/** The score from about a month ago: the snapshot nearest 30 days back, taken
 *  between 28 and 35 days ago. Null until a month of history exists. */
export async function scoreAMonthAgo(userId: string): Promise<{ score: number; date: string } | null> {
  if (!(await hasTable())) return null;
  const { rows } = await pool.query<{ score: number; snapshot_date: Date }>(
    `SELECT score, snapshot_date
       FROM network_health_snapshots
      WHERE user_id = $1
        AND snapshot_date BETWEEN CURRENT_DATE - 35 AND CURRENT_DATE - 28
      ORDER BY ABS((CURRENT_DATE - snapshot_date) - 30)
      LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  return row ? { score: row.score, date: row.snapshot_date.toISOString().slice(0, 10) } : null;
}

/** Nightly, so users who do not open the app still get a daily point. */
export function startHealthSnapshotScheduler(): void {
  if (process.env.NODE_ENV === "test") return;
  cron.schedule(
    "15 3 * * *",
    () => {
      recordHealthSnapshots().catch((err) => logger.error({ err }, "Network Health snapshot failed"));
    },
    { timezone: "UTC" },
  );
}
