// The Android push routes end to end, against the real Express app and the test
// Postgres. Only Google is faked.
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import request from "supertest";
import { app, authHeaders } from "./testApp";
import { pool } from "../src/db";

const USER = "user_fcm_test";
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function configure() {
  process.env["FCM_SERVICE_ACCOUNT_B64"] = Buffer.from(
    JSON.stringify({
      project_id: "novara-test",
      client_email: "routes@novara-test.iam.gserviceaccount.com",
      private_key: privateKey,
    }),
  ).toString("base64");
}

/** Fakes Google. `send` decides the answer to each message. */
function fakeGoogle(send: () => Response) {
  const mock = vi.fn(async (url: string) =>
    String(url).includes("oauth2")
      ? new Response(JSON.stringify({ access_token: "a", expires_in: 3600 }), { status: 200 })
      : send(),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}
const ok = () => new Response(JSON.stringify({ name: "m" }), { status: 200 });
const sends = (mock: ReturnType<typeof fakeGoogle>) =>
  mock.mock.calls.filter(([url]) => String(url).includes("messages:send")).length;

const register = (token = "android-1") =>
  request(app).post("/api/notifications/fcm-token").set(authHeaders(USER)).send({ token });
const tokens = async () =>
  (await pool.query("SELECT device_token FROM fcm_tokens WHERE user_id = $1", [USER])).rows.map((r) => r.device_token);
const pushEnabled = async () =>
  (await pool.query("SELECT push_enabled FROM user_settings WHERE user_id = $1", [USER])).rows[0]?.push_enabled;

afterEach(() => {
  delete process.env["FCM_SERVICE_ACCOUNT_B64"];
  vi.unstubAllGlobals();
});

describe("Android push routes", () => {
  it("require sign-in", async () => {
    expect((await request(app).post("/api/notifications/fcm-token").send({ token: "x" })).status).toBe(401);
    expect((await request(app).delete("/api/notifications/fcm-token").send({})).status).toBe(401);
  });

  it("are inert without the key, and never touch fcm_tokens", async () => {
    const spy = vi.spyOn(pool, "query");
    expect((await register()).status).toBe(503);
    const removed = await request(app).delete("/api/notifications/fcm-token").set(authHeaders(USER)).send({});
    expect(removed.status).toBe(200);
    expect(spy.mock.calls.some(([sql]) => String(sql).includes("fcm_tokens"))).toBe(false);
    spy.mockRestore();
  });

  it("rejects a missing token", async () => {
    configure();
    const res = await request(app).post("/api/notifications/fcm-token").set(authHeaders(USER)).send({});
    expect(res.status).toBe(400);
  });

  it("registers a token once and turns push on", async () => {
    configure();
    expect((await register()).status).toBe(200);
    expect((await register()).status).toBe(200);
    expect(await tokens()).toEqual(["android-1"]);
    expect(await pushEnabled()).toBe(true);
  });

  it("removing the last device turns push off", async () => {
    configure();
    await register();
    const res = await request(app).delete("/api/notifications/fcm-token").set(authHeaders(USER)).send({});
    expect(res.status).toBe(200);
    expect(await tokens()).toEqual([]);
    expect(await pushEnabled()).toBe(false);
  });

  it("removing Android leaves push on while a web subscription remains", async () => {
    configure();
    await register();
    await pool.query(
      "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, 'https://push.example.com/1', 'p', 'a')",
      [USER],
    );
    await request(app).delete("/api/notifications/fcm-token").set(authHeaders(USER)).send({ token: "android-1" });
    expect(await pushEnabled()).toBe(true);
  });

  it("the test notification goes to Android", async () => {
    configure();
    const google = fakeGoogle(ok);
    await register();
    const res = await request(app).post("/api/notifications/test").set(authHeaders(USER)).send({});
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(1);
    expect(sends(google)).toBe(1);
  });

  it("a dead token is removed", async () => {
    configure();
    fakeGoogle(() => new Response(JSON.stringify({ error: { details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 }));
    await register();
    await request(app).post("/api/notifications/test").set(authHeaders(USER)).send({});
    expect(await tokens()).toEqual([]);
  });

  it("a Google outage keeps the token", async () => {
    configure();
    fakeGoogle(() => new Response("{}", { status: 503 }));
    await register();
    await request(app).post("/api/notifications/test").set(authHeaders(USER)).send({});
    expect(await tokens()).toEqual(["android-1"]);
  });

  it("an Android user with a web subscription is only notified on Android", async () => {
    configure();
    const google = fakeGoogle(ok);
    await register();
    await pool.query(
      "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, 'https://push.example.com/2', 'p', 'a')",
      [USER],
    );
    const res = await request(app).post("/api/notifications/test").set(authHeaders(USER)).send({});
    expect(res.body.sent).toBe(1);
    expect(sends(google)).toBe(1);
  });

  it("the test notification still reports no devices without the key", async () => {
    const res = await request(app).post("/api/notifications/test").set(authHeaders(USER)).send({});
    expect(res.status).toBe(400);
  });

  it("account deletion removes the user's Android tokens", async () => {
    configure();
    await register();
    // The Clerk deletion call is not mocked here, so the route may report that
    // the login could not be removed. The data deletion is committed first.
    await request(app).delete("/api/account").set(authHeaders(USER));
    expect(await tokens()).toEqual([]);
  });
});
