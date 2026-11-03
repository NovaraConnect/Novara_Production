import { pool } from "../db";
import { runMetered } from "./aiUsage";

// The hard monthly AI spend cap per user, across every AI feature. Past the cap
// each feature uses its non-AI fallback, so a user never sees an error.
//
// A call first reserves more than one call can cost, in a single atomic SQL
// statement, so parallel requests and several API instances can't overrun the
// cap. When it finishes, the reservation is replaced by what it really cost. A
// call that never got a provider response (timeout, provider error) costs 0.
//
// If the table can't be read, AI is refused: an outage here must not become
// uncapped spending, and the fallbacks keep the app working.
//
// Config: AI_USER_MONTHLY_CAP_USD (optional, default 0.25).

const DEFAULT_CAP_USD = 0.25;
const MICROS_PER_USD = 1_000_000;

/** Covers a full-size call at the highest listed price: 8,000 characters of OCR
 *  text, the system prompt, and the largest max_tokens in use. A rarer, larger
 *  call settles at its real cost, so the cap can be passed by that one call at
 *  most and the next one is refused. */
export const RESERVE_MICROS = 12_000;

export function monthlyCapMicros(): number {
  const parsed = Number(process.env["AI_USER_MONTHLY_CAP_USD"]);
  const usd = process.env["AI_USER_MONTHLY_CAP_USD"]?.trim() && Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_CAP_USD;
  return Math.round(usd * MICROS_PER_USD);
}

/** First day of the calendar month, in UTC. */
export function monthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

async function reserve(userId: string, month: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO ai_usage_monthly (user_id, month, spent_micros, calls)
     SELECT $1, $2::date, $3::bigint, 1 WHERE $3::bigint <= $4::bigint
     ON CONFLICT (user_id, month) DO UPDATE
       SET spent_micros = ai_usage_monthly.spent_micros + EXCLUDED.spent_micros,
           calls = ai_usage_monthly.calls + 1,
           updated_at = now()
       WHERE ai_usage_monthly.spent_micros + EXCLUDED.spent_micros <= $4::bigint
     RETURNING user_id`,
    [userId, month, RESERVE_MICROS, monthlyCapMicros()],
  );
  return (rowCount ?? 0) > 0;
}

export type BudgetedResult<T> = { allowed: true; value: T } | { allowed: false };

/** Runs one AI call if the user has budget left this month. `{ allowed: false }`
 *  means the call did not run and the caller should use its non-AI fallback. */
export async function withAiBudget<T>(userId: string, fn: () => Promise<T>): Promise<BudgetedResult<T>> {
  const month = monthKey();
  let reserved: boolean;
  try {
    reserved = await reserve(userId, month);
  } catch (err) {
    console.error("[ai-budget] reserve failed; AI refused:", err instanceof Error ? err.message : String(err));
    return { allowed: false };
  }
  if (!reserved) {
    // METADATA ONLY — never the user id.
    console.log("[ai-budget]", JSON.stringify({ event: "monthly_cap_reached" }));
    return { allowed: false };
  }

  let micros = 0;
  try {
    const metered = await runMetered(fn);
    micros = metered.micros;
    return { allowed: true, value: metered.value };
  } finally {
    // On failure here the reservation stands, which over-counts: the safe way.
    await pool
      .query(
        `UPDATE ai_usage_monthly
            SET spent_micros = GREATEST(0, spent_micros + $3::bigint), updated_at = now()
          WHERE user_id = $1 AND month = $2::date`,
        [userId, month, micros - RESERVE_MICROS],
      )
      .catch((err: unknown) => {
        console.error("[ai-budget] settle failed:", err instanceof Error ? err.message : String(err));
      });
  }
}
