import { Router, type IRouter } from "express";
import { pool } from "../db";

const router: IRouter = Router();

/**
 * Environment variables the service cannot run without. Checked on every
 * health call because reading process.env costs nothing.
 */
function missingEnvVars(): string[] {
  const missing: string[] = [];
  // db.ts connects via DATABASE_URL ?? NEON_DATABASE_URL, so only flag the DB
  // URL as missing when neither is set (production uses DATABASE_URL).
  if (!process.env["DATABASE_URL"] && !process.env["NEON_DATABASE_URL"]) {
    missing.push("DATABASE_URL");
  }
  for (const v of ["CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "PORT"]) {
    if (!process.env[v]) missing.push(v);
  }
  return missing;
}

// GET /api/healthz — liveness. Deliberately does NOT touch the database.
//
// This used to run `SELECT 1` on every call. Render polls it every ~5 seconds,
// which is ~17,000 queries a day, and Neon bills for every hour the compute is
// awake — so the database never once scaled to zero. In September that quietly
// consumed the entire 100-hour monthly allowance on a pilot with a handful of
// real requests, the compute was cut off mid-month, and the API returned 502
// until the plan was upgraded.
//
// A liveness probe answers "is this process up and configured", which is what
// Render needs to decide whether to restart or route traffic. Restarting the
// API would not fix a database outage anyway. Use /api/healthz/db for a real
// connectivity check.
router.get("/healthz", (_req, res) => {
  const missing = missingEnvVars();
  res.status(200).json({
    status: "ok",
    environment: process.env.NODE_ENV ?? "unknown",
    ...(missing.length ? { missingEnvVars: missing } : {}),
    timestamp: new Date().toISOString(),
  });
});

// A deep check is cached briefly so pointing a monitor at it cannot recreate
// the always-awake problem by accident.
const DEEP_CACHE_MS = 30_000;
let lastDeepCheck: { at: number; connected: boolean; error: string | null } | null = null;

// GET /api/healthz/db — readiness. Actually queries Postgres, so it wakes the
// database. For manual checks and deploy verification, NOT for a polling probe.
router.get("/healthz/db", async (_req, res) => {
  const now = Date.now();

  if (!lastDeepCheck || now - lastDeepCheck.at > DEEP_CACHE_MS) {
    try {
      await pool.query("SELECT 1");
      lastDeepCheck = { at: now, connected: true, error: null };
    } catch (err) {
      lastDeepCheck = {
        at: now,
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const missing = missingEnvVars();
  res.status(lastDeepCheck.connected ? 200 : 503).json({
    status: lastDeepCheck.connected ? "ok" : "degraded",
    environment: process.env.NODE_ENV ?? "unknown",
    databaseConnected: lastDeepCheck.connected,
    checkedAt: new Date(lastDeepCheck.at).toISOString(),
    cached: now - lastDeepCheck.at > 0 && now !== lastDeepCheck.at,
    ...(lastDeepCheck.error ? { databaseError: lastDeepCheck.error } : {}),
    ...(missing.length ? { missingEnvVars: missing } : {}),
    timestamp: new Date().toISOString(),
  });
});

export default router;
