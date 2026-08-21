import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./testApp";

// Catches regressions like the session's Clerk-instance-mismatch bug: every
// route that is supposed to require a signed-in user must actually 401 an
// unauthenticated request, not silently serve or 500.
describe("authentication is required on protected routes", () => {
  const protectedGets = [
    "/api/contacts",
    "/api/settings",
    "/api/notifications/settings",
  ];

  for (const path of protectedGets) {
    it(`GET ${path} without auth returns 401`, async () => {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    });
  }

  it("POST /api/contacts without auth returns 401", async () => {
    const res = await request(app).post("/api/contacts").send({});
    expect(res.status).toBe(401);
  });

  it("PUT /api/contacts/:id without auth returns 401", async () => {
    const res = await request(app)
      .put("/api/contacts/00000000-0000-0000-0000-000000000000")
      .send({});
    expect(res.status).toBe(401);
  });

  it("DELETE /api/contacts/:id without auth returns 401", async () => {
    const res = await request(app).delete(
      "/api/contacts/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status).toBe(401);
  });

  it("PUT /api/settings without auth returns 401", async () => {
    const res = await request(app).put("/api/settings").send({});
    expect(res.status).toBe(401);
  });

  it("POST /api/notifications/subscribe without auth returns 401", async () => {
    const res = await request(app).post("/api/notifications/subscribe").send({});
    expect(res.status).toBe(401);
  });
});

// The app also has two intentionally-public routes; these should stay public
// (a change that accidentally required auth on either would break the app
// before sign-in / before push permission is granted).
describe("intentionally public routes stay public", () => {
  it("GET /api/healthz does not require auth", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).not.toBe(401);
  });

  it("GET /api/notifications/vapid-public-key does not require auth", async () => {
    const res = await request(app).get("/api/notifications/vapid-public-key");
    expect(res.status).not.toBe(401);
  });
});
