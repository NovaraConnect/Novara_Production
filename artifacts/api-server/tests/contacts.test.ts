import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, authHeaders } from "./testApp";

const USER_A = "user_test_a";
const USER_B = "user_test_b";

function validContact(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Ada",
    lastName: "Lovelace",
    company: "Analytical Engines Inc",
    ...overrides,
  };
}

describe("contacts CRUD", () => {
  it("creates a contact and lists it back for the same user", async () => {
    const create = await request(app)
      .post("/api/contacts")
      .set(authHeaders(USER_A))
      .send(validContact());
    expect(create.status).toBe(201);
    expect(create.body.firstName).toBe("Ada");
    expect(create.body.company).toBe("Analytical Engines Inc");

    const list = await request(app).get("/api/contacts").set(authHeaders(USER_A));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(create.body.id);
  });

  it("rejects creating a contact missing required fields (validation failure)", async () => {
    const res = await request(app)
      .post("/api/contacts")
      .set(authHeaders(USER_A))
      .send({ firstName: "Only First Name" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("gets, updates, and deletes a single contact", async () => {
    const created = await request(app)
      .post("/api/contacts")
      .set(authHeaders(USER_A))
      .send(validContact());
    const id = created.body.id;

    const got = await request(app).get(`/api/contacts/${id}`).set(authHeaders(USER_A));
    expect(got.status).toBe(200);
    expect(got.body.id).toBe(id);

    const updated = await request(app)
      .put(`/api/contacts/${id}`)
      .set(authHeaders(USER_A))
      .send({ company: "New Co" });
    expect(updated.status).toBe(200);
    expect(updated.body.company).toBe("New Co");

    const deleted = await request(app).delete(`/api/contacts/${id}`).set(authHeaders(USER_A));
    expect(deleted.status).toBe(200);
    expect(deleted.body.success).toBe(true);

    const afterDelete = await request(app).get(`/api/contacts/${id}`).set(authHeaders(USER_A));
    expect(afterDelete.status).toBe(404);
  });

  it("returns 404 for a contact id that does not exist", async () => {
    const res = await request(app)
      .get("/api/contacts/00000000-0000-0000-0000-000000000000")
      .set(authHeaders(USER_A));
    expect(res.status).toBe(404);
  });

  describe("cross-user authorization", () => {
    it("user B cannot view user A's contact", async () => {
      const created = await request(app)
        .post("/api/contacts")
        .set(authHeaders(USER_A))
        .send(validContact());
      const id = created.body.id;

      const res = await request(app).get(`/api/contacts/${id}`).set(authHeaders(USER_B));
      expect(res.status).toBe(404);
    });

    it("user B cannot edit user A's contact", async () => {
      const created = await request(app)
        .post("/api/contacts")
        .set(authHeaders(USER_A))
        .send(validContact());
      const id = created.body.id;

      const res = await request(app)
        .put(`/api/contacts/${id}`)
        .set(authHeaders(USER_B))
        .send({ company: "Hijacked Co" });
      expect(res.status).toBe(404);

      const stillOwnedByA = await request(app)
        .get(`/api/contacts/${id}`)
        .set(authHeaders(USER_A));
      expect(stillOwnedByA.body.company).toBe("Analytical Engines Inc");
    });

    it("user B cannot delete user A's contact", async () => {
      const created = await request(app)
        .post("/api/contacts")
        .set(authHeaders(USER_A))
        .send(validContact());
      const id = created.body.id;

      const res = await request(app).delete(`/api/contacts/${id}`).set(authHeaders(USER_B));
      expect(res.status).toBe(404);

      const stillThere = await request(app).get(`/api/contacts/${id}`).set(authHeaders(USER_A));
      expect(stillThere.status).toBe(200);
    });

    it("user B's contact list never includes user A's contacts", async () => {
      await request(app).post("/api/contacts").set(authHeaders(USER_A)).send(validContact());
      await request(app)
        .post("/api/contacts")
        .set(authHeaders(USER_B))
        .send(validContact({ firstName: "Grace", lastName: "Hopper" }));

      const listB = await request(app).get("/api/contacts").set(authHeaders(USER_B));
      expect(listB.body).toHaveLength(1);
      expect(listB.body[0].firstName).toBe("Grace");
    });
  });
});
