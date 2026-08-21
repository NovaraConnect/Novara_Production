import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, forcedAuthErrorHeaders } from "./testApp";

// These tests target the specific incident classes called out for this
// suite: they should each fail loudly if the corresponding regression is
// reintroduced.
describe("regression: CORS misconfiguration", () => {
  it("allows the configured frontend origin", async () => {
    const res = await request(app)
      .get("/api/healthz")
      .set("Origin", "http://localhost:5173"); // matches FRONTEND_URL set in setup.ts
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("does not reflect an unlisted origin", async () => {
    const res = await request(app)
      .get("/api/healthz")
      .set("Origin", "https://not-our-frontend.example.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("regression: Clerk auth failures fail closed (the 401 incident)", () => {
  it("returns 401, not 500, when Clerk verification throws (e.g. instance/audience mismatch)", async () => {
    const res = await request(app)
      .get("/api/contacts")
      .set(forcedAuthErrorHeaders());
    expect(res.status).toBe(401);
  });

  it("returns 401 with an error body for a plain unauthenticated request", async () => {
    const res = await request(app).get("/api/contacts");
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });
});
