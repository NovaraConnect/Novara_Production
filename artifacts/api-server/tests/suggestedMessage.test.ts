import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, authHeaders } from "./testApp";

const USER = "user_suggested_message";
const base = { firstName: "Priya", lastName: "Raman", company: "Northwind Labs", role: "Head of Growth" };

// No AI provider is configured in tests, so every draft here is the
// deterministic template — the same thing users get when the provider is
// down or a daily cap is reached.
describe("POST /api/contacts/:id/suggested-message", () => {
  it("drafts one message and a subject line", async () => {
    const { body: created } = await request(app).post("/api/contacts").set(authHeaders(USER))
      .send({ ...base, metAt: "the product meetup" });

    const res = await request(app).post(`/api/contacts/${created.id}/suggested-message`).set(authHeaders(USER)).send({});
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("template");
    expect(res.body.subject).toBe("Following up from the product meetup");
    expect(res.body.message).toMatch(/^Hi Priya, it was a pleasure meeting you at the product meetup\./);
    expect(res.body.message.length).toBeLessThanOrEqual(500);
    expect(res.body.message).not.toContain("Raman");
  });

  it("personalizes a follow-up with a headline from the client", async () => {
    // Spoke after the day they met → a follow-up, which must be personalized.
    const { body: created } = await request(app).post("/api/contacts").set(authHeaders(USER))
      .send({ ...base, firstContactDate: "2026-09-01", lastInteractionDate: "2026-10-01" });
    const res = await request(app).post(`/api/contacts/${created.id}/suggested-message`).set(authHeaders(USER))
      .send({ headline: "Northwind Labs opens a Denver office" });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Northwind Labs opens a Denver office");
  });

  it("is 404 for another user's contact", async () => {
    const { body: created } = await request(app).post("/api/contacts").set(authHeaders(USER)).send(base);
    const res = await request(app).post(`/api/contacts/${created.id}/suggested-message`).set(authHeaders("user_someone_else")).send({});
    expect(res.status).toBe(404);
  });
});
