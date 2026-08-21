import { Router, type IRouter } from "express";
import { pool } from "../db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  let dbConnected = false;
  let dbError: string | null = null;

  try {
    await pool.query("SELECT 1");
    dbConnected = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const missingVars: string[] = [];
  // db.ts connects via DATABASE_URL ?? NEON_DATABASE_URL, so only flag the DB
  // URL as missing when neither is set (production uses DATABASE_URL).
  if (!process.env["DATABASE_URL"] && !process.env["NEON_DATABASE_URL"]) {
    missingVars.push("DATABASE_URL");
  }
  const required = ["CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "PORT"];
  for (const v of required) {
    if (!process.env[v]) missingVars.push(v);
  }

  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "degraded",
    environment: process.env.NODE_ENV ?? "unknown",
    databaseConnected: dbConnected,
    ...(dbError ? { databaseError: dbError } : {}),
    ...(missingVars.length ? { missingEnvVars: missingVars } : {}),
    timestamp: new Date().toISOString(),
  });
});

export default router;
