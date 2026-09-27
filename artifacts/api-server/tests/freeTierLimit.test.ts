// The Novara Free ceiling, on both paths that can create contacts.
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, authHeaders } from "./testApp";

const USER = "user_limit";
const LIMIT = 6;

const person = (n: number) => ({ firstName: `P${n}`, lastName: "Test", company: "Acme" });

async function fill(count: number) {
  for (let i = 0; i < count; i++) {
    const res = await request(app).post("/api/contacts").set(authHeaders(USER)).send(person(i));
    expect(res.status).toBe(201);
  }
}

describe("free tier limit", () => {
  it(`allows ${LIMIT} contacts and refuses the next one`, async () => {
    await fill(LIMIT);
    const over = await request(app).post("/api/contacts").set(authHeaders(USER)).send(person(99));
    expect(over.status).toBe(403);
    expect(over.body.code).toBe("CONTACT_LIMIT_REACHED");
    expect(over.body.message).toContain(String(LIMIT));

    const list = await request(app).get("/api/contacts").set(authHeaders(USER));
    expect(list.body).toHaveLength(LIMIT);
  });

  it("import cannot be used to bypass the limit", async () => {
    const res = await request(app).post("/api/contacts/import").set(authHeaders(USER))
      .send({ contacts: Array.from({ length: 20 }, (_, i) => person(i)) });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(LIMIT);
    expect(res.body.skippedOverLimit).toBe(20 - LIMIT);
    expect(res.body.code).toBe("CONTACT_LIMIT_REACHED");
  });

  it("import refuses outright once the user is already at the limit", async () => {
    await fill(LIMIT);
    const res = await request(app).post("/api/contacts/import").set(authHeaders(USER))
      .send({ contacts: [person(50)] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CONTACT_LIMIT_REACHED");
  });

  it("deleting frees a slot", async () => {
    await fill(LIMIT);
    const list = await request(app).get("/api/contacts").set(authHeaders(USER));
    await request(app).delete(`/api/contacts/${list.body[0].id}`).set(authHeaders(USER));
    const again = await request(app).post("/api/contacts").set(authHeaders(USER)).send(person(77));
    expect(again.status).toBe(201);
  });
});
