import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, authHeaders } from "./testApp";

const USER_A = "user_test_a";

describe("notifications endpoints", () => {
  it("exposes the VAPID public key without auth", async () => {
    const res = await request(app).get("/api/notifications/vapid-public-key");
    // 503 is the correct, documented response when VAPID keys aren't
    // configured (intentionally the case in this test environment) — either
    // way it must not be a 401, since this route has no auth gate.
    expect([200, 503]).toContain(res.status);
  });

  it("requires auth for notification settings", async () => {
    const res = await request(app).get("/api/notifications/settings");
    expect(res.status).toBe(401);
  });

  it("returns default notification settings for a new user", async () => {
    const res = await request(app)
      .get("/api/notifications/settings")
      .set(authHeaders(USER_A));
    expect(res.status).toBe(200);
    expect(res.body.notifyDueToday).toBe(true);
    expect(res.body.reminderTime).toBe("09:00");
  });

  it("updates notification settings", async () => {
    const res = await request(app)
      .put("/api/notifications/settings")
      .set(authHeaders(USER_A))
      .send({ notifyDueToday: false, reminderTime: "18:00" });
    expect(res.status).toBe(200);
    expect(res.body.notifyDueToday).toBe(false);
    expect(res.body.reminderTime).toBe("18:00");
  });

  it("rejects an invalid push subscription payload (validation failure)", async () => {
    const res = await request(app)
      .post("/api/notifications/subscribe")
      .set(authHeaders(USER_A))
      .send({ endpoint: "https://push.example.com/abc" }); // missing keys.p256dh / keys.auth
    expect(res.status).toBe(400);
  });

  it("accepts a valid push subscription payload", async () => {
    const res = await request(app)
      .post("/api/notifications/subscribe")
      .set(authHeaders(USER_A))
      .send({
        endpoint: "https://push.example.com/abc",
        keys: { p256dh: "test-p256dh", auth: "test-auth" },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
