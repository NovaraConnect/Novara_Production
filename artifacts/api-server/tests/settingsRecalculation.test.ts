// Saving career goals re-scores contacts, and each re-score is one AI call per
// contact, so it must not run for an unchanged profile, a lapsed user, or past
// the daily limit.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { app, authHeaders } from "./testApp";
import { pool } from "../src/db";

const analyze = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/enrich", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/enrich")>("../src/lib/enrich");
  return { ...actual, isAiEnrichEnabled: () => true, analyzeContactForUser: (_u: string, ...rest: unknown[]) => analyze(...rest) };
});

const DAY = 24 * 60 * 60 * 1000;
let seq = 0;
const uniqueUser = () => `user_recalc_${++seq}_${Date.now()}`;

const save = (user: string, careerStatement: string) =>
  request(app).put("/api/settings").set(authHeaders(user)).send({ careerStatement });

async function seedContact(user: string) {
  await pool.query(
    `INSERT INTO contacts (user_id, first_name, last_name, company) VALUES ($1, 'P', 'Test', 'Acme')`,
    [user],
  );
}

async function grantPro(user: string) {
  await pool.query(
    `INSERT INTO entitlements (user_id, source, product_id, status, expires_at, last_event_at, updated_at)
     VALUES ($1, 'apple_iap', 'group.novaraconnect.app.pro.monthly', 'active', $2, now(), now())`,
    [user, new Date(Date.now() + DAY)],
  );
}

beforeEach(() => {
  analyze.mockReset();
  analyze.mockResolvedValue({ priority: "High", reason: "", industry: null, function: null });
});

describe("career profile saves", () => {
  it("re-scores when the profile changes, and not when it is re-sent unchanged", async () => {
    const user = uniqueUser();
    await seedContact(user);

    const first = await save(user, "Breaking into climate tech");
    expect(first.body.recalculation).toMatchObject({ ok: true, examined: 1 });
    expect(analyze).toHaveBeenCalledTimes(1);

    const second = await save(user, "Breaking into climate tech");
    expect(second.status).toBe(200);
    expect(second.body.recalculation).toBeNull();
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it("falls back to the deterministic score past the daily limit, and still saves", async () => {
    const user = uniqueUser();
    await seedContact(user);

    for (let i = 0; i < 2; i++) await save(user, `Goal ${i}`);
    expect(analyze).toHaveBeenCalledTimes(2);

    const over = await save(user, "One more goal");
    expect(over.status).toBe(200);
    expect(over.body.careerStatement).toBe("One more goal");
    expect(over.body.recalculation).toMatchObject({ ok: true, examined: 1 });
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  describe("once a subscription is required", () => {
    beforeAll(() => {
      process.env["IAP_PAYWALL_ENABLED"] = "on";
      process.env["IAP_SUBSCRIPTION_REQUIRED"] = "on";
    });
    afterAll(() => {
      delete process.env["IAP_PAYWALL_ENABLED"];
      delete process.env["IAP_SUBSCRIPTION_REQUIRED"];
    });

    it("does not spend AI on a user without one", async () => {
      const user = uniqueUser();
      await seedContact(user);

      const res = await save(user, "Lapsed but editing goals");
      expect(res.status).toBe(200);
      expect(res.body.recalculation).toMatchObject({ ok: true, examined: 1 });
      expect(analyze).not.toHaveBeenCalled();
    });

    it("uses AI for a subscriber", async () => {
      const user = uniqueUser();
      await seedContact(user);
      await grantPro(user);

      await save(user, "Subscribed");
      expect(analyze).toHaveBeenCalledTimes(1);
    });
  });
});

describe("account deletion", () => {
  it("removes the user's network health history", async () => {
    const user = uniqueUser();
    await pool.query(
      "INSERT INTO network_health_snapshots (user_id, snapshot_date, score) VALUES ($1, CURRENT_DATE, 80)",
      [user],
    );

    // The Clerk call is not mocked; the data deletion is committed before it.
    await request(app).delete("/api/account").set(authHeaders(user));

    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM network_health_snapshots WHERE user_id = $1", [user]);
    expect(rows[0].n).toBe(0);
  });
});
