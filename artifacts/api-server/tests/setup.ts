import { beforeEach, afterAll, vi } from "vitest";
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { Pool } = pg;

// Test-only defaults so importing the app doesn't require real secrets.
// Real DB connectivity still comes from DATABASE_URL (set by CI to point at
// the Postgres service container) — see db.ts, which reads
// DATABASE_URL ?? NEON_DATABASE_URL.
process.env.NODE_ENV ??= "test";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_ci_placeholder";
process.env.CLERK_SECRET_KEY ??= "sk_test_ci_placeholder";
process.env.FRONTEND_URL ??= "http://localhost:5173";
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are intentionally left unset so the
// notification cron scheduler no-ops instead of registering a real timer
// that would keep the test process alive (see lib/scheduler.ts).
// RESEND_API_KEY is intentionally left unset in tests too — lib/email.ts
// degrades to a no-op (logs a warning) instead of calling the real Resend
// API, which is exactly what the feedback tests expect for the
// email-provider-failure scenario.

// Mock @clerk/express so tests can authenticate as any user without a real
// Clerk instance, and can simulate Clerk verification failures on demand
// (used by the Clerk-mismatch regression test).
//
// - clerkMiddleware(): a no-op passthrough. The real one would attach auth
// state via Clerk's context; requireAuth (middlewares/auth.ts) calls
// getAuth(req) directly, which is what we intercept below.
// - getAuth(req): reads a test-only header instead of a verified session
// token. Throws when `x-test-force-auth-error` is set, mirroring what
// real Clerk does when a token doesn't match the configured instance /
// authorizedParties (the exact failure mode behind the historical 401 bug).
vi.mock("@clerk/express", () => ({
clerkMiddleware:
() =>
(_req: unknown, _res: unknown, next: () => void) =>
next(),
getAuth: (req: { headers: Record<string, unknown> }) => {
if (req.headers["x-test-force-auth-error"]) {
throw new Error(
"mock Clerk verification failure (simulated instance/audience mismatch)",
);
}
const userId = req.headers["x-test-user-id"];
return { userId: typeof userId === "string" ? userId : null };
},
}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.join(__dirname, "schema.sql"), "utf-8");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
schemaReady ??= pool.query(schema).then(() => undefined);
return schemaReady;
}

// Full isolation between every single test, not just between files: each
// test starts with empty tables so cross-test pollution (e.g. contact counts
// leaking between "it" blocks) can't produce a false pass.
beforeEach(async () => {
await ensureSchema();
await pool.query(
"TRUNCATE contacts, user_settings, push_subscriptions, feedback RESTART IDENTITY CASCADE",
);
});

afterAll(async () => {
await pool.end();
});
