import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, authHeaders } from "./testApp";

const USER = "user_suggested_message";
const base = { firstName: "Priya", lastName: "Raman", company: "Northwind Labs", role: "Head of Growth" };

// No AI flag is set in tests, so every draft here is the deterministic
// template — the same thing users get when the provider is down.
describe("POST /api/contacts/:id/suggested-message", () => {
  it("drafts a message for the contact's preferred channel", async () => {
    const { body: created } = await request(app).post("/api/contacts").set(authHeaders(USER))
      .send({ ...base, email: "priya@northwind.example", preferredContactMethod: "email", metAt: "the product meetup" });

    const res = await request(app).post(`/api/contacts/${created.id}/suggested-message`).set(authHeaders(USER)).send({});
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("template");
    expect(res.body.channel).toBe("email");
    expect(res.body.message).toMatch(/^Hi Priya, it was a pleasure meeting you at the product meetup\./);
    expect(res.body.message).not.toContain("Raman");
  });

  it("honours an explicit channel and a headline from the client", async () => {
    const { body: created } = await request(app).post("/api/contacts").set(authHeaders(USER)).send(base);
    const res = await request(app).post(`/api/contacts/${created.id}/suggested-message`).set(authHeaders(USER))
      .send({ channel: "linkedin", headline: "Northwind Labs opens a Denver office" });
    expect(res.status).toBe(200);
    expect(res.body.channel).toBe("linkedin");
    expect(res.body.message).toContain("Northwind Labs opens a Denver office");
  });

  it("is 404 for another user's contact", async () => {
    const { body: created } = await request(app).post("/api/contacts").set(authHeaders(USER)).send(base);
    const res = await request(app).post(`/api/contacts/${created.id}/suggested-message`).set(authHeaders("user_someone_else")).send({});
    expect(res.status).toBe(404);
  });
});
