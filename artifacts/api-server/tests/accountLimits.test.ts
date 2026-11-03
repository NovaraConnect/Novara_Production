// The per-account limits in lib/usageLimits.ts and their fallbacks.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app, authHeaders } from "./testApp";
import { pool } from "../src/db";
import { DAILY_LIMITS, takeDaily, takeDraft } from "../src/lib/usageLimits";
import { MAX_CONTACTS_PER_ACCOUNT } from "../src/lib/entitlements";

const DAY = 24 * 60 * 60 * 1000;
let seq = 0;
const newUser = () => `user_limit_${++seq}_${Date.now()}`;

async function grantPro(user: string) {
  await pool.query(
    `INSERT INTO entitlements (user_id, source, product_id, status, expires_at, last_event_at, updated_at)
     VALUES ($1, 'apple_iap', 'group.novaraconnect.app.pro.monthly', 'active', $2, now(), now())`,
    [user, new Date(Date.now() + DAY)],
  );
}

async function seedContacts(user: string, count: number) {
  await pool.query(
    `INSERT INTO contacts (user_id, first_name, last_name, company)
     SELECT $1, 'P' || n, 'Test', 'Acme' FROM generate_series(1, $2::int) n`,
    [user, count],
  );
}

const person = { firstName: "New", lastName: "Person", company: "Acme" };

describe("takeDaily", () => {
  it("allows the limit, refuses the next, and resets the next day", async () => {
    const user = newUser();
    const today = new Date("2026-11-03T12:00:00Z");
    expect(await takeDaily(user, "x", 2, { now: today })).toBe(true);
    expect(await takeDaily(user, "x", 2, { now: today })).toBe(true);
    expect(await takeDaily(user, "x", 2, { now: today })).toBe(false);
    expect(await takeDaily(user, "y", 2, { now: today })).toBe(true);
    expect(await takeDaily(user, "x", 2, { now: new Date("2026-11-04T00:00:01Z") })).toBe(true);
  });

  it("can't be passed by parallel calls", async () => {
    const user = newUser();
    const results = await Promise.all(Array.from({ length: 10 }, () => takeDaily(user, "x", 3)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it("answers onFailure when the count can't be read", async () => {
    const spy = vi.spyOn(pool, "query").mockRejectedValueOnce(new Error("down") as never);
    expect(await takeDaily(newUser(), "x", 3)).toBe(false);
    spy.mockRejectedValueOnce(new Error("down") as never);
    expect(await takeDaily(newUser(), "x", 3, { onFailure: true })).toBe(true);
    spy.mockRestore();
  });
});

describe("draft limits", () => {
  it("holds per contact and per account", async () => {
    const user = newUser();
    for (let i = 0; i < DAILY_LIMITS.draftsPerContact; i++) expect(await takeDraft(user, "c1")).toBe(true);
    expect(await takeDraft(user, "c1")).toBe(false);

    let granted = DAILY_LIMITS.draftsPerContact;
    for (let c = 2; granted < DAILY_LIMITS.drafts; c++) {
      expect(await takeDraft(user, `c${c}`)).toBe(true);
      granted++;
    }
    expect(await takeDraft(user, "another")).toBe(false);
  });
});

describe("contact ceiling", () => {
  it("stops a subscriber at the account maximum, with its own message", async () => {
    const user = newUser();
    await grantPro(user);
    await seedContacts(user, MAX_CONTACTS_PER_ACCOUNT);

    const res = await request(app).post("/api/contacts").set(authHeaders(user)).send(person);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_CONTACT_LIMIT");
  });

  it("lets a subscriber past the old free limit", async () => {
    const user = newUser();
    await grantPro(user);
    await seedContacts(user, 6);
    const res = await request(app).post("/api/contacts").set(authHeaders(user)).send(person);
    expect(res.status).toBe(201);
  });
});

describe("imports", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ firstName: `I${i}`, lastName: "T", company: "Acme" }));
  const send = (user: string, contacts: object[]) =>
    request(app).post("/api/contacts/import").set(authHeaders(user)).send({ contacts });

  it("imports one batch's worth and reports the rest", async () => {
    const user = newUser();
    await grantPro(user);
    const res = await send(user, rows(205));
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(200);
    expect(res.body.skippedOverLimit).toBe(5);
  });

  it("refuses past the daily number of imports", async () => {
    const user = newUser();
    await grantPro(user);
    for (let i = 0; i < DAILY_LIMITS.imports; i++) expect((await send(user, rows(1))).status).toBe(200);
    const res = await send(user, rows(1));
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("IMPORT_LIMIT_REACHED");
  });
});

describe("parses", () => {
  beforeEach(() => {
    process.env["CARD_AI_PARSE"] = "on";
    process.env["CARD_AI_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "test-key";
  });
  afterEach(() => {
    delete process.env["CARD_AI_PARSE"];
    delete process.env["CARD_AI_PROVIDER"];
    delete process.env["ANTHROPIC_API_KEY"];
  });

  it("answers daily_cap without calling AI once the limit is used", async () => {
    const user = newUser();
    await pool.query(
      "INSERT INTO account_usage_daily (user_id, day, bucket, count) VALUES ($1, $2::date, 'parse', $3)",
      [user, new Date().toISOString().slice(0, 10), DAILY_LIMITS.parses],
    );
    const res = await request(app).post("/api/parse-card-text").set(authHeaders(user)).send({ text: "Jane Doe" });
    expect(res.body).toEqual({ ok: false, reason: "daily_cap" });
  });
});

describe("requests per minute", () => {
  const original = process.env.ACCOUNT_REQUESTS_PER_MINUTE;
  afterEach(() => {
    process.env.ACCOUNT_REQUESTS_PER_MINUTE = original;
  });

  it("limits one account without affecting another on the same address", async () => {
    process.env.ACCOUNT_REQUESTS_PER_MINUTE = "2";
    const busy = newUser();
    const get = (user: string) => request(app).get("/api/settings").set(authHeaders(user));
    expect((await get(busy)).status).toBe(200);
    expect((await get(busy)).status).toBe(200);
    const limited = await get(busy);
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("ACCOUNT_RATE_LIMIT");
    expect((await get(newUser())).status).toBe(200);
  });

  it("leaves signed-out routes to the address limit", async () => {
    process.env.ACCOUNT_REQUESTS_PER_MINUTE = "1";
    for (let i = 0; i < 3; i++) expect((await request(app).get("/api/healthz")).status).toBe(200);
  });
});

describe("account deletion", () => {
  it("removes usage counts", async () => {
    const user = newUser();
    await takeDaily(user, "x", 3);
    await request(app).delete("/api/account").set(authHeaders(user));
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM account_usage_daily WHERE user_id = $1", [user]);
    expect(rows[0].n).toBe(0);
  });
});
