import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, authHeaders } from "./testApp";

const USER_A = "user_test_a";

describe("settings CRUD", () => {
  it("returns sensible defaults for a user with no saved settings", async () => {
    const res = await request(app).get("/api/settings").set(authHeaders(USER_A));
    expect(res.status).toBe(200);
    expect(res.body.autoDowngradeAfterMonths).toBe(6);
    expect(res.body.careerStatement).toBe("");
  });

  it("saves and returns updated settings", async () => {
    const res = await request(app)
      .put("/api/settings")
      .set(authHeaders(USER_A))
      .send({ careerStatement: "Breaking into climate tech", autoDowngradeAfterMonths: 9 });
    expect(res.status).toBe(200);
    expect(res.body.careerStatement).toBe("Breaking into climate tech");
    expect(res.body.autoDowngradeAfterMonths).toBe(9);

    const refetched = await request(app).get("/api/settings").set(authHeaders(USER_A));
    expect(refetched.body.careerStatement).toBe("Breaking into climate tech");
  });

  it("keeps settings scoped per user", async () => {
    await request(app)
      .put("/api/settings")
      .set(authHeaders("user_isolated_1"))
      .send({ careerStatement: "Goal A" });

    const other = await request(app).get("/api/settings").set(authHeaders("user_isolated_2"));
    expect(other.body.careerStatement).toBe("");
  });
});
