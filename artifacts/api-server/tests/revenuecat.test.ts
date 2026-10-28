// RevenueCat webhook + Apple-sourced Pro entitlement, end to end against the
// real Express app and the test Postgres.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { app, authHeaders } from "./testApp";
import { isAuthorised, entitlementChangeFor } from "../src/routes/revenuecat";
import { pool } from "../src/db";

const WEBHOOK = "/api/webhooks/revenuecat";
const SECRET = "rc-test-webhook-secret";
const USER = "user_rc_pro";
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;
function makeEvent(over: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `evt_test_${seq}_${Math.random().toString(36).slice(2)}`,
    type: "INITIAL_PURCHASE",
    app_user_id: USER,
    product_id: "group.novaraconnect.app.pro.monthly",
    entitlement_ids: ["novara_pro"],
    expiration_at_ms: Date.now() + 30 * DAY,
    event_timestamp_ms: Date.now(),
    environment: "SANDBOX",
    original_transaction_id: "1000000001",
    ...over,
  };
}

/** `auth` defaults to the configured secret. Pass null to send no header at all. */
function deliver(event: Record<string, unknown>, auth: string | null = SECRET) {
  const req = request(app).post(WEBHOOK).send({ api_version: "1.0", event });
  return auth === null ? req : req.set("Authorization", auth);
}

const person = (n: number) => ({ firstName: `P${n}`, lastName: "Test", company: "Acme" });
async function fill(count: number, user = USER) {
  for (let i = 0; i < count; i++) {
    const res = await request(app).post("/api/contacts").set(authHeaders(user)).send(person(i));
    expect(res.status).toBe(201);
  }
}

describe("RevenueCat webhook", () => {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env["REVENUECAT_WEBHOOK_AUTH"];
    process.env["REVENUECAT_WEBHOOK_AUTH"] = SECRET;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env["REVENUECAT_WEBHOOK_AUTH"];
    else process.env["REVENUECAT_WEBHOOK_AUTH"] = previous;
  });

  it("refuses everything when the secret is not configured", async () => {
    delete process.env["REVENUECAT_WEBHOOK_AUTH"];
    try {
      const res = await deliver(makeEvent());
      expect(res.status).toBe(503);
    } finally {
      process.env["REVENUECAT_WEBHOOK_AUTH"] = SECRET;
    }
  });

  it("rejects a missing or wrong Authorization header", async () => {
    expect((await deliver(makeEvent(), null)).status).toBe(401);
    expect((await deliver(makeEvent(), "wrong")).status).toBe(401);
    const status = await request(app).get("/api/entitlements/me").set(authHeaders(USER));
    expect(status.body.pro).toBe(false);
  });

  it("rejects a malformed event", async () => {
    const res = await request(app).post(WEBHOOK).set("Authorization", SECRET).send({ event: { id: 1 } });
    expect(res.status).toBe(400);
  });

  it("an INITIAL_PURCHASE grants Pro, and Pro allows adding contacts", async () => {
    const res = await deliver(makeEvent());
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("applied");

    const me = await request(app).get("/api/entitlements/me").set(authHeaders(USER));
    expect(me.body.pro).toBe(true);
    expect(me.body.source).toBe("apple_iap");

    await fill(10);
    const list = await request(app).get("/api/contacts").set(authHeaders(USER));
    expect(list.body).toHaveLength(10);
  });

  it("a redelivered event is a no-op", async () => {
    const event = makeEvent();
    expect((await deliver(event)).body.outcome).toBe("applied");
    expect((await deliver(event)).body.outcome).toBe("duplicate");
  });

  it("EXPIRATION removes Pro and adding contacts stops", async () => {
    await deliver(makeEvent());
    const expiredAt = Date.now() - 1000;
    const expired = await deliver(makeEvent({
      type: "EXPIRATION",
      expiration_at_ms: expiredAt,
      event_timestamp_ms: Date.now() + 1000,
    }));
    expect(expired.body.outcome).toBe("applied");

    const me = await request(app).get("/api/entitlements/me").set(authHeaders(USER));
    expect(me.body.pro).toBe(false);

    const over = await request(app).post("/api/contacts").set(authHeaders(USER)).send(person(99));
    expect(over.status).toBe(403);
    expect(over.body.code).toBe("SUBSCRIPTION_REQUIRED");
  });

  it("an older event cannot overwrite a newer state", async () => {
    const now = Date.now();
    await deliver(makeEvent({ event_timestamp_ms: now }));
    const stale = await deliver(makeEvent({
      type: "EXPIRATION",
      expiration_at_ms: now - 1000,
      event_timestamp_ms: now - 60_000,
    }));
    expect(stale.body.outcome).toBe("ignored");
    const me = await request(app).get("/api/entitlements/me").set(authHeaders(USER));
    expect(me.body.pro).toBe(true);
  });

  it("an anonymous RevenueCat ID never grants access", async () => {
    const res = await deliver(makeEvent({ app_user_id: "$RCAnonymousID:abc123" }));
    expect(res.body.outcome).toBe("ignored");
  });

  it("an event for another entitlement is ignored", async () => {
    const res = await deliver(makeEvent({ entitlement_ids: ["something_else"] }));
    expect(res.body.outcome).toBe("ignored");
    const me = await request(app).get("/api/entitlements/me").set(authHeaders(USER));
    expect(me.body.pro).toBe(false);
  });

  it("a grant with no expiry is not honoured", async () => {
    const res = await deliver(makeEvent({ expiration_at_ms: null }));
    expect(res.body.outcome).toBe("ignored");
  });

  it("import is unlimited for Pro", async () => {
    await deliver(makeEvent());
    const res = await request(app).post("/api/contacts/import").set(authHeaders(USER))
      .send({ contacts: Array.from({ length: 12 }, (_, i) => person(i)) });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(12);
    expect(res.body.skippedOverLimit ?? 0).toBe(0);
  });

  it("account deletion removes entitlement and RevenueCat event rows for the user", async () => {
    await deliver(makeEvent());
    const before = await pool.query("SELECT COUNT(*)::int AS n FROM entitlements WHERE user_id = $1", [USER]);
    expect(before.rows[0].n).toBe(1);

    // The Clerk deletion call is not mocked here, so the route may report that
    // the login could not be removed. The data deletion is committed first.
    await request(app).delete("/api/account").set(authHeaders(USER));

    const ent = await pool.query("SELECT COUNT(*)::int AS n FROM entitlements WHERE user_id = $1", [USER]);
    const evt = await pool.query("SELECT COUNT(*)::int AS n FROM revenuecat_events WHERE app_user_id = $1", [USER]);
    expect(ent.rows[0].n).toBe(0);
    expect(evt.rows[0].n).toBe(0);
  });

  it("a refund (CANCELLATION with CUSTOMER_SUPPORT) removes Pro at once", async () => {
    await deliver(makeEvent());
    const refund = await deliver(makeEvent({
      type: "CANCELLATION",
      cancel_reason: "CUSTOMER_SUPPORT",
      event_timestamp_ms: Date.now() + 1000,
    }));
    expect(refund.body.outcome).toBe("applied");
    const me = await request(app).get("/api/entitlements/me").set(authHeaders(USER));
    expect(me.body.pro).toBe(false);
  });

  it("an ordinary CANCELLATION keeps Pro until the period ends", async () => {
    await deliver(makeEvent());
    await deliver(makeEvent({
      type: "CANCELLATION",
      cancel_reason: "UNSUBSCRIBE",
      event_timestamp_ms: Date.now() + 1000,
    }));
    const me = await request(app).get("/api/entitlements/me").set(authHeaders(USER));
    expect(me.body.pro).toBe(true);
  });

  it("SUBSCRIPTION_EXTENDED moves the expiry later", async () => {
    await deliver(makeEvent());
    const later = Date.now() + 60 * DAY;
    await deliver(makeEvent({
      type: "SUBSCRIPTION_EXTENDED",
      expiration_at_ms: later,
      event_timestamp_ms: Date.now() + 1000,
    }));
    const me = await request(app).get("/api/entitlements/me").set(authHeaders(USER));
    expect(me.body.expiresAt).toBe(new Date(later).toISOString());
  });

  it("TRANSFER (no app_user_id) moves Pro to the new Novara account", async () => {
    const OTHER = "user_rc_other";
    await deliver(makeEvent());
    const { id, event_timestamp_ms } = makeEvent({ event_timestamp_ms: Date.now() + 1000 });
    const res = await deliver({
      id,
      type: "TRANSFER",
      event_timestamp_ms,
      transferred_from: [USER],
      transferred_to: ["$RCAnonymousID:xyz", OTHER],
      environment: "SANDBOX",
    });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("applied");

    const oldOwner = await request(app).get("/api/entitlements/me").set(authHeaders(USER));
    const newOwner = await request(app).get("/api/entitlements/me").set(authHeaders(OTHER));
    expect(oldOwner.body.pro).toBe(false);
    expect(newOwner.body.pro).toBe(true);
  });

  it("TRANSFER with nothing to move is recorded and ignored", async () => {
    const res = await deliver({
      id: `evt_transfer_${Date.now()}`,
      type: "TRANSFER",
      event_timestamp_ms: Date.now(),
      transferred_from: ["user_nobody"],
      transferred_to: ["user_somebody"],
    });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("ignored");
  });

  it("answers 'not subscribed' instead of failing if migration 0004 was not applied", async () => {
    const original = pool.query.bind(pool);
    const spy = vi.spyOn(pool, "query").mockImplementation(((text: unknown, ...rest: unknown[]) => {
      if (typeof text === "string" && text.includes("FROM entitlements")) {
        return Promise.reject(Object.assign(new Error('relation "entitlements" does not exist'), { code: "42P01" }));
      }
      return (original as (...a: unknown[]) => unknown)(text, ...rest);
    }) as never);
    try {
      const res = await request(app).post("/api/contacts").set(authHeaders(USER)).send(person(1));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("SUBSCRIPTION_REQUIRED");
      const me = await request(app).get("/api/entitlements/me").set(authHeaders(USER));
      expect(me.body.pro).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("the status endpoint requires sign-in", async () => {
    const res = await request(app).get("/api/entitlements/me");
    expect(res.status).toBe(401);
  });
});

describe("pure helpers", () => {
  it("isAuthorised compares exactly", () => {
    expect(isAuthorised(SECRET, SECRET)).toBe(true);
    expect(isAuthorised(SECRET + " ", SECRET)).toBe(false);
    expect(isAuthorised(undefined, SECRET)).toBe(false);
    expect(isAuthorised(SECRET, undefined)).toBe(false);
  });

  it("entitlementChangeFor only maps the events it understands", () => {
    const base = makeEvent();
    expect(entitlementChangeFor(base as never)?.active).toBe(true);
    expect(entitlementChangeFor({ ...base, type: "TEST" } as never)).toBeNull();
    expect(entitlementChangeFor({ ...base, type: "TRANSFER" } as never)).toBeNull();
    expect(entitlementChangeFor({ ...base, app_user_id: "user bad id" } as never)).toBeNull();
    expect(entitlementChangeFor(base as never)?.willRenew).toBe(true);
    expect(entitlementChangeFor({ ...base, type: "RENEWAL" } as never)?.willRenew).toBe(true);
    expect(entitlementChangeFor({ ...base, type: "PRODUCT_CHANGE" } as never)?.willRenew).toBe(true);
    expect(entitlementChangeFor({ ...base, type: "UNCANCELLATION" } as never)?.willRenew).toBe(true);
    expect(entitlementChangeFor({ ...base, type: "CANCELLATION" } as never)?.willRenew).toBe(false);
    expect(entitlementChangeFor({ ...base, type: "EXPIRATION" } as never)?.willRenew).toBe(false);
    expect(entitlementChangeFor({ ...base, type: "BILLING_ISSUE" } as never)?.willRenew).toBeNull();
  });
});
