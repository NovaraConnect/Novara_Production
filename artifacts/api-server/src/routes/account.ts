// ============================================================================
// Account deletion.
//
// App Store Review Guideline 5.1.1(v): "If your app supports account creation,
// you must also offer account deletion within the app." Novara supports
// account creation (Clerk sign-up), so this is a submission blocker, not a
// nice-to-have. Apple expects the account itself to go — not a deactivation,
// and not an email to support.
//
// ORDER OF OPERATIONS, and why:
//
//   1. Application data, in one transaction. Either all of a user's rows go or
//      none do; a half-deleted account is the worst outcome available.
//   2. The Clerk user, last. Deleting it first would sign the user out
//      mid-request and, if step 1 then failed, would leave rows keyed to an
//      identity nobody can sign in as to retry — personal data with no route
//      to erasure. This way a failure at step 2 leaves an empty, still
//      reachable account that retrying finishes off.
//
// The endpoint is intentionally not parameterised: it only ever deletes the
// caller's own account, identified by the verified Clerk session.
// ============================================================================
import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { clerkClient } from "@clerk/express";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Every table holding per-user rows, all keyed by `user_id`.
 *
 * Hard-coded, never interpolated from a request: these names go into SQL as
 * identifiers, which cannot be parameterised.
 */
const USER_TABLES = [
  "contacts",
  "push_subscriptions",
  "apns_tokens",
  "feedback",
  "user_settings",
] as const;

/**
 * Narrows the list to the tables this deployment actually has.
 *
 * `apns_tokens` is created by migration 0002 and can legitimately be absent —
 * the notifications routes already guard against that. Checking first matters
 * because in Postgres a failed statement aborts the whole transaction, so
 * "try the delete and catch the error" would silently take the other tables'
 * deletes down with it.
 */
async function existingUserTables(): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string; exists: boolean }>(
    `SELECT t.table_name, to_regclass('public.' || t.table_name) IS NOT NULL AS exists
       FROM unnest($1::text[]) AS t(table_name)`,
    [USER_TABLES as unknown as string[]],
  );
  return rows.filter((row) => row.exists).map((row) => row.table_name);
}

// DELETE /api/account — erases the signed-in user's data and their login.
router.delete("/account", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;

  let tables: string[];
  try {
    tables = await existingUserTables();
  } catch (err) {
    logger.error({ err }, "Account deletion could not inspect the schema");
    res.status(500).json({ error: "Failed to delete your data. Please try again." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const table of tables) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ err }, "Account deletion failed while removing user data");
    res.status(500).json({ error: "Failed to delete your data. Please try again." });
    return;
  } finally {
    client.release();
  }

  try {
    await clerkClient.users.deleteUser(userId);
  } catch (err) {
    logger.error({ err }, "Account data deleted but the Clerk user could not be removed");
    res.status(500).json({
      error: "Your Novara data was deleted, but your login could not be removed. Please try again.",
    });
    return;
  }

  logger.info("Account deleted at user request");
  res.status(204).end();
});

export default router;
