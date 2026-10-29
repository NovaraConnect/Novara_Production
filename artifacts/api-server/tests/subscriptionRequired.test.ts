// One Novara Pro plan with a 7-day free trial: who can add contacts, and the
// subscription state the app shows.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import { app, authHeaders } from "./testApp";
import { pool } from "../src/db";
import { billingPeriodFor } from "../src/lib/entitlements";

const WEBHOOK = "/api/webhooks/revenuecat";
const SECRET = "rc-test-webhook-secret";
const USER = "user_sub_required";
const DAY = 24 * 60 * 60 * 1000;
const MONTHLY = "group.novaraconnect.app.pro.monthly";
const ANNUAL = "group.novaraconnect.app.pro.annual";

let seq = 0;
function event(over: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `evt_sub_${seq}_${Math.random().toString(36).slice(2)}`,
    type: "INITIAL_PURCHASE",
    app_user_id: USER,
    product_id: MONTHLY,
    period_type: "TRIAL",
    entitlement_ids: ["novara_pro"],
    expiration_at_ms: Date.now() + 7 * DAY,
    event_timestamp_ms: Date.now() + seq,
    environment: "SANDBOX",
    original_transaction_id: "2000000001",
    ...over,
  };
}

async function deliver(e: Record<string, unknown>) {
  const res = await request(app).post(WEBHOOK).set("Authorization", SECRET).send({ api_version: "1.0", event: e });
  expect(res.status).toBe(200);
}

const person = (n: number) => ({ firstName: `P${n}`, lastName: "Test", company: "Acme" });
const add = (n: number) => request(app).post("/api/contacts").set(authHeaders(USER)).send(person(n));
const me = async () => (await request(app).get("/api/entitlements/me").set(authHeaders(USER))).body;

/** Inserts contacts directly, as an existing user would already have them. */
async function seedContacts(count: number) {
  for (let i = 0; i < count; i++) {
    await pool.query(
      `INSERT INTO contacts (user_id, first_name, last_name, company) VALUES ($1, $2, 'Test', 'Acme')`,
      [USER, `Seed${i}`],
    );
  }
}

const ENV_KEYS = ["REVENUECAT_WEBHOOK_AUTH", "IAP_PAYWALL_ENABLED", "IAP_SUBSCRIPTION_REQUIRED"] as const;
const saved: Record<string, string | undefined> = {};

function requireSubscription(on: boolean, paywall = on) {
  if (paywall) process.env["IAP_PAYWALL_ENABLED"] = "true";
  else delete process.env["IAP_PAYWALL_ENABLED"];
  if (on) process.env["IAP_SUBSCRIPTION_REQUIRED"] = "true";
  else delete process.env["IAP_SUBSCRIPTION_REQUIRED"];
}

describe("subscription required (one Pro plan, 7-day trial)", () => {
  beforeAll(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env["REVENUECAT_WEBHOOK_AUTH"] = SECRET;
  });
  afterEach(() => requireSubscription(false));
  afterAll(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("someone who never subscribed cannot add or import, and is told why", async () => {
    requireSubscription(true);
    const res = await add(1);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("SUBSCRIPTION_REQUIRED");

    const imp = await request(app).post("/api/contacts/import").set(authHeaders(USER))
      .send({ contacts: [person(2)] });
    expect(imp.status).toBe(403);
    expect(imp.body.code).toBe("SUBSCRIPTION_REQUIRED");

    expect(await me()).toMatchObject({ pro: false, state: "none", billingPeriod: null });
    const features = await request(app).get("/api/features");
    expect(features.body).toMatchObject({ applePaywall: true, subscriptionRequired: true });
  });

  it("the requirement is ignored while the paywall is off, so nobody is asked to pay where they cannot buy", async () => {
    requireSubscription(true, false);
    expect((await add(1)).status).toBe(201);
    const features = await request(app).get("/api/features");
    expect(features.body).toMatchObject({ applePaywall: false, subscriptionRequired: false });
  });

  it("a free trial unlocks adding without a limit and reports days left", async () => {
    requireSubscription(true);
    await deliver(event());
    const status = await me();
    expect(status).toMatchObject({ pro: true, state: "trial", billingPeriod: "monthly" });
    expect(new Date(status.expiresAt).getTime()).toBeGreaterThan(Date.now() + 6 * DAY);

    for (let i = 0; i < 10; i++) expect((await add(i)).status).toBe(201);
  });

  it("the trial turning into a paid annual plan reports Pro annual", async () => {
    requireSubscription(true);
    await deliver(event({ product_id: ANNUAL }));
    await deliver(event({ type: "RENEWAL", product_id: ANNUAL, period_type: "NORMAL", expiration_at_ms: Date.now() + 365 * DAY }));
    expect(await me()).toMatchObject({ pro: true, state: "active", billingPeriod: "annual" });
  });

  it("after a trial lapses unpaid: nothing is lost, but adding stops", async () => {
    requireSubscription(true);
    await seedContacts(3);
    await deliver(event());
    await deliver(event({ type: "EXPIRATION", expiration_at_ms: Date.now() - 1000 }));

    expect(await me()).toMatchObject({ pro: false, state: "expired", billingPeriod: "monthly", expiresAt: null });
    expect((await add(9)).body.code).toBe("SUBSCRIPTION_REQUIRED");

    const list = await request(app).get("/api/contacts").set(authHeaders(USER));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(3);

    const [first, second] = list.body;
    const edit = await request(app).put(`/api/contacts/${first.id}`).set(authHeaders(USER))
      .send({ ...person(0), firstName: "Edited" });
    expect(edit.status).toBe(403);
    expect(edit.body.code).toBe("SUBSCRIPTION_REQUIRED");
    const del = await request(app).delete(`/api/contacts/${second.id}`).set(authHeaders(USER));
    expect(del.status).toBeLessThan(300);
  });

  // Every route that shows or works on contacts, or runs a paid AI call, as
  // [method, path, body]. Listing and deleting are left open on purpose.
  const gated = (id: string): [string, string, Record<string, unknown>?][] => [
    ["get", `/api/contacts/${id}`],
    ["put", `/api/contacts/${id}`, { ...person(0), firstName: "Edited" }],
    ["put", `/api/contacts/${id}/photo`, { photo: "data:image/png;base64,AAAA" }],
    ["post", `/api/contacts/${id}/mark-contacted`, {}],
    ["post", `/api/contacts/${id}/suggested-message`, {}],
    ["post", "/api/contacts/recalculate", {}],
    ["post", "/api/parse-card-text", { text: "Jane Doe\nAcme" }],
    ["post", "/api/parse-linkedin-text", { text: "Jane Doe\nEngineer at Acme" }],
    ["get", "/api/company-news?company=Acme"],
    ["get", "/api/network-health/trend"],
  ];
  const call = (method: string, path: string, body?: Record<string, unknown>) => {
    const r = (request(app) as unknown as Record<string, (p: string) => request.Test>)[method](path).set(authHeaders(USER));
    return body ? r.send(body) : r;
  };

  it("without a trial or Pro, the server refuses to show, edit or run AI on contacts", async () => {
    requireSubscription(true);
    await seedContacts(2);
    const { rows: [{ id }] } = await pool.query("SELECT id FROM contacts WHERE user_id = $1 LIMIT 1", [USER]);

    for (const [method, path, body] of gated(id)) {
      const res = await call(method, path, body);
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(403);
      expect(res.body.code, `${method.toUpperCase()} ${path}`).toBe("SUBSCRIPTION_REQUIRED");
    }

    // Still open, so the data can be exported or removed.
    expect((await request(app).get("/api/contacts").set(authHeaders(USER))).body).toHaveLength(2);
    expect((await request(app).delete(`/api/contacts/${id}`).set(authHeaders(USER))).status).toBeLessThan(300);
  });

  it("during a trial, and before a subscription is required, none of those are refused", async () => {
    await seedContacts(1);
    const { rows: [{ id }] } = await pool.query("SELECT id FROM contacts WHERE user_id = $1 LIMIT 1", [USER]);
    const notRefused = async () => {
      for (const [method, path, body] of gated(id)) {
        const res = await call(method, path, body);
        expect(res.body?.code, `${method.toUpperCase()} ${path}`).not.toBe("SUBSCRIPTION_REQUIRED");
      }
    };

    await notRefused(); // requirement off
    requireSubscription(true);
    await deliver(event());
    await notRefused(); // trial
  });

  it("an expiry date in the past counts as expired even without an EXPIRATION event", async () => {
    await deliver(event({ expiration_at_ms: Date.now() - 1000 }));
    expect(await me()).toMatchObject({ pro: false, state: "expired" });
  });

  it("before a subscription is required, Free keeps the 6-contact limit", async () => {
    await seedContacts(6);
    const res = await add(7);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CONTACT_LIMIT_REACHED");
  });

  it("still answers 'not subscribed' if migration 0007 was not applied", async () => {
    const original = pool.query.bind(pool);
    const spy = vi.spyOn(pool, "query").mockImplementation(((text: unknown, ...rest: unknown[]) => {
      if (typeof text === "string" && text.includes("period_type") && text.includes("FROM entitlements")) {
        return Promise.reject(Object.assign(new Error('column "period_type" does not exist'), { code: "42703" }));
      }
      return (original as (...a: unknown[]) => unknown)(text, ...rest);
    }) as never);
    try {
      expect(await me()).toMatchObject({ pro: false, state: "none" });
    } finally {
      spy.mockRestore();
    }
  });

  it("tracks whether the subscription will renew: cancel, then turn back on", async () => {
    await deliver(event());
    expect(await me()).toMatchObject({ pro: true, state: "trial", willRenew: true });

    // Auto-renew turned off: still Pro until the end, but it won't renew.
    await deliver(event({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" }));
    expect(await me()).toMatchObject({ pro: true, state: "trial", willRenew: false });

    // Turned back on.
    await deliver(event({ type: "UNCANCELLATION" }));
    expect(await me()).toMatchObject({ pro: true, willRenew: true });
  });

  it("an event that says nothing about renewal keeps the last answer", async () => {
    await deliver(event());
    await deliver(event({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" }));
    await deliver(event({ type: "SUBSCRIPTION_EXTENDED", expiration_at_ms: Date.now() + 9 * DAY }));
    expect(await me()).toMatchObject({ pro: true, willRenew: false });
  });

  it("an older CANCELLATION cannot overwrite a newer RENEWAL", async () => {
    const t = Date.now();
    await deliver(event({ type: "RENEWAL", period_type: "NORMAL", event_timestamp_ms: t + 5000, expiration_at_ms: t + 30 * DAY }));
    await deliver(event({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", event_timestamp_ms: t + 1000 }));
    expect(await me()).toMatchObject({ pro: true, willRenew: true });
  });

  it("reports renewal as unknown (null) for rows from before it was tracked, and when not Pro", async () => {
    await deliver(event());
    await pool.query("UPDATE entitlements SET will_renew = NULL WHERE user_id = $1", [USER]);
    expect(await me()).toMatchObject({ pro: true, willRenew: null });

    await deliver(event({ type: "EXPIRATION", expiration_at_ms: Date.now() - 1000 }));
    expect(await me()).toMatchObject({ pro: false, state: "expired", willRenew: null });
  });

  it("billingPeriodFor reads the product ID", () => {
    expect(billingPeriodFor(MONTHLY)).toBe("monthly");
    expect(billingPeriodFor(ANNUAL)).toBe("annual");
    expect(billingPeriodFor("something.else")).toBeNull();
    expect(billingPeriodFor(null)).toBeNull();
  });
});

describe("local StoreKit test entitlement (development only)", () => {
  const PATH = "/api/dev/storekit-test/entitlement";
  const KEYS = ["IAP_LOCAL_STOREKIT_TEST", "NODE_ENV", "RENDER"] as const;
  const before: Record<string, string | undefined> = {};
  beforeAll(() => { for (const k of KEYS) before[k] = process.env[k]; });
  afterEach(() => {
    for (const k of KEYS) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  });

  const report = (body: Record<string, unknown>) =>
    request(app).post(PATH).set(authHeaders(USER)).send(body);
  const trial = { active: true, productId: MONTHLY, expiresAt: new Date(Date.now() + 7 * DAY).toISOString(), isTrial: true };

  it("does not exist unless switched on", async () => {
    expect((await report(trial)).status).toBe(404);
    expect((await me()).pro).toBe(false);
  });

  it("never works in production or on Render, even when switched on", async () => {
    process.env["IAP_LOCAL_STOREKIT_TEST"] = "true";
    process.env["NODE_ENV"] = "production";
    expect((await report(trial)).status).toBe(404);
    process.env["NODE_ENV"] = "development";
    process.env["RENDER"] = "true";
    expect((await report(trial)).status).toBe(404);
    expect((await me()).pro).toBe(false);
  });

  it("locally, records a simulator trial, its renewal and its expiry", async () => {
    process.env["IAP_LOCAL_STOREKIT_TEST"] = "true";
    delete process.env["RENDER"];
    expect((await report(trial)).body.outcome).toBe("applied");
    expect(await me()).toMatchObject({ pro: true, state: "trial", billingPeriod: "monthly" });

    await report({ active: true, productId: ANNUAL, expiresAt: new Date(Date.now() + 365 * DAY).toISOString(), isTrial: false });
    expect(await me()).toMatchObject({ pro: true, state: "active", billingPeriod: "annual" });

    // Auto-renew turned off in Xcode's transaction manager.
    await report({ active: true, productId: ANNUAL, expiresAt: new Date(Date.now() + 365 * DAY).toISOString(), isTrial: false, willRenew: false });
    expect(await me()).toMatchObject({ pro: true, willRenew: false });

    await report({ active: false, productId: ANNUAL, expiresAt: new Date(Date.now() - 1000).toISOString(), isTrial: false });
    expect(await me()).toMatchObject({ pro: false, state: "expired" });

    const features = await request(app).get("/api/features");
    expect(features.body.localStoreKitTest).toBe(true);
  });

  it("requires sign-in", async () => {
    process.env["IAP_LOCAL_STOREKIT_TEST"] = "true";
    expect((await request(app).post(PATH).send(trial)).status).toBe(401);
  });
});
