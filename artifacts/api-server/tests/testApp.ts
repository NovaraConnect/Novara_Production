// Shared helper for backend tests: imports the real Express app (same one
// index.ts serves in production) and provides small helpers for setting the
// mocked test-auth headers registered in setup.ts.
import app from "../src/app";
import { pool } from "../src/db";

export { app };

/** Gives a test user an active Novara Pro subscription. Adding contacts needs
 *  one, so call it in beforeEach (after setup.ts has emptied the tables). */
export async function grantPro(userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO entitlements (user_id, source, product_id, status, expires_at, period_type)
     VALUES ($1, 'apple_iap', 'group.novaraconnect.app.pro.monthly', 'active', now() + interval '30 days', 'NORMAL')`,
    [userId],
  );
}

export function authHeaders(userId: string): Record<string, string> {
  return { "x-test-user-id": userId };
}

export function forcedAuthErrorHeaders(): Record<string, string> {
  return { "x-test-force-auth-error": "1" };
}
