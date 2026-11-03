import { pool } from "../db";
import { logger } from "./logger";

// Per-account daily limits, on top of the monthly AI spend cap in aiBudget.ts.
// Counted in Postgres so a restart can't reset them and several API instances
// share one count. Past a limit each feature uses its fallback where it has one.

export const DAILY_LIMITS = {
  /** AI message drafts; past this, the template. */
  drafts: 10,
  draftsPerContact: 3,
  /** Re-scoring every contact with AI; past this, the keyword score. */
  rescores: 2,
  /** AI card and LinkedIn parses, together; past this, the on-device parser. */
  parses: 30,
  imports: 3,
  /** Company news lookups that reach the provider. Cached news doesn't count. */
  newsFetches: 100,
} as const;

export const MAX_IMPORT_BATCH = 200;
export const MAX_CONTACT_PHOTOS = 100;

/** Roughly 1 write in 100 also clears old rows, as the news cache does. */
const PRUNE_PROBABILITY = 0.01;
const KEEP_DAYS = 35;

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Uses one of today's `limit` for this bucket. Atomic, so parallel requests
 * can't pass the limit. `onFailure` is the answer when the count can't be read:
 * false for anything that costs money, so an outage can't become uncapped spend.
 */
export async function takeDaily(
  userId: string,
  bucket: string,
  limit: number,
  { onFailure = false, now = new Date() }: { onFailure?: boolean; now?: Date } = {},
): Promise<boolean> {
  try {
    const { rowCount } = await pool.query(
      `INSERT INTO account_usage_daily (user_id, day, bucket, count)
       SELECT $1, $2::date, $3, 1 WHERE $4::int >= 1
       ON CONFLICT (user_id, day, bucket) DO UPDATE
         SET count = account_usage_daily.count + 1
         WHERE account_usage_daily.count < $4::int
       RETURNING count`,
      [userId, utcDay(now), bucket, limit],
    );
    if (Math.random() < PRUNE_PROBABILITY) {
      pool
        .query("DELETE FROM account_usage_daily WHERE day < $1::date - $2::int", [utcDay(now), KEEP_DAYS])
        .catch((err: unknown) => logger.warn({ err }, "usage count prune failed"));
    }
    return (rowCount ?? 0) > 0;
  } catch (err) {
    logger.error({ err, bucket }, "usage count failed");
    return onFailure;
  }
}

/** One AI re-score of all contacts, shared by Settings and the manual route. */
export function takeRescore(userId: string): Promise<boolean> {
  return takeDaily(userId, "rescore", DAILY_LIMITS.rescores);
}

/** One AI draft: within the limit for this contact, then for the account. */
export async function takeDraft(userId: string, contactId: string): Promise<boolean> {
  if (!(await takeDaily(userId, `draft:${contactId}`, DAILY_LIMITS.draftsPerContact))) return false;
  return takeDaily(userId, "draft", DAILY_LIMITS.drafts);
}

/** One AI parse of card or LinkedIn text. */
export function takeParse(userId: string): Promise<boolean> {
  return takeDaily(userId, "parse", DAILY_LIMITS.parses);
}
