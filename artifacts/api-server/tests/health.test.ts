import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { app } from "./testApp";
import { pool } from "../src/db";

describe("health endpoint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports ok without touching the database", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body).not.toHaveProperty("databaseConnected");
  });

  // The incident this guards: /api/healthz used to run SELECT 1, Render polls
  // it every ~5 seconds, and Neon bills per hour of compute uptime. The probe
  // alone kept the database awake around the clock and burned the whole
  // monthly compute allowance, taking production down mid-month.
  it("issues no query at all, so the probe cannot keep the database awake", async () => {
    const query = vi.spyOn(pool, "query");
    await request(app).get("/api/healthz");
    expect(query).not.toHaveBeenCalled();
  });

  it("reports database connectivity on the explicit deep check", async () => {
    const res = await request(app).get("/api/healthz/db");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.databaseConnected).toBe(true);
  });

  // Regression test: /api/healthz is supposed to surface a missing DB
  // connection string as a missing-env-var warning. db.ts connects via
  // DATABASE_URL ?? NEON_DATABASE_URL, so the DB URL counts as missing only
  // when BOTH are unset. This guards against the "missing DATABASE_URL" class
  // of incident recurring silently, without falsely flagging production (which
  // sets DATABASE_URL, not NEON_DATABASE_URL) as misconfigured.
  it("flags the database URL as missing when neither DATABASE_URL nor NEON_DATABASE_URL is set", async () => {
    const originalDb = process.env.DATABASE_URL;
    const originalNeon = process.env.NEON_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.NEON_DATABASE_URL;
    try {
      const res = await request(app).get("/api/healthz");
      expect(res.body.missingEnvVars).toContain("DATABASE_URL");
    } finally {
      if (originalDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDb;
      if (originalNeon === undefined) delete process.env.NEON_DATABASE_URL;
      else process.env.NEON_DATABASE_URL = originalNeon;
    }
  });

  it("does not flag the database URL as missing when DATABASE_URL is configured", async () => {
    const originalDb = process.env.DATABASE_URL;
    const originalNeon = process.env.NEON_DATABASE_URL;
    process.env.DATABASE_URL = "postgres://placeholder-for-this-test-only";
    delete process.env.NEON_DATABASE_URL;
    try {
      const res = await request(app).get("/api/healthz");
      expect(res.body.missingEnvVars ?? []).not.toContain("DATABASE_URL");
    } finally {
      if (originalDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDb;
      if (originalNeon === undefined) delete process.env.NEON_DATABASE_URL;
      else process.env.NEON_DATABASE_URL = originalNeon;
    }
  });
});
