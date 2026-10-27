import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, authHeaders } from "./testApp";

const USER = "user_birthday";
const base = { firstName: "Bea", lastName: "Day", company: "Acme" };

describe("contact birthdays", () => {
  it("saves a birthday given when the contact is created", async () => {
    const res = await request(app).post("/api/contacts").set(authHeaders(USER)).send({ ...base, birthday: "--10-27" });
    expect(res.status).toBe(201);
    expect(res.body.birthday).toBe("--10-27");

    const list = await request(app).get("/api/contacts").set(authHeaders(USER));
    expect(list.body[0].birthday).toBe("--10-27");
  });

  it("creates a contact without a birthday", async () => {
    const res = await request(app).post("/api/contacts").set(authHeaders(USER)).send(base);
    expect(res.status).toBe(201);
    expect(res.body.birthday).toBeUndefined();
  });

  it("changes, keeps and clears a birthday on edit", async () => {
    const { body: created } = await request(app).post("/api/contacts").set(authHeaders(USER)).send({ ...base, birthday: "--10-27" });

    const changed = await request(app).put(`/api/contacts/${created.id}`).set(authHeaders(USER)).send({ birthday: "--11-27" });
    expect(changed.status).toBe(200);
    expect(changed.body.birthday).toBe("--11-27");

    const untouched = await request(app).put(`/api/contacts/${created.id}`).set(authHeaders(USER)).send({ company: "New Co" });
    expect(untouched.body.birthday).toBe("--11-27");

    const cleared = await request(app).put(`/api/contacts/${created.id}`).set(authHeaders(USER)).send({ birthday: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.birthday).toBeUndefined();
  });

  it("rejects dates that aren't a real month and day, and years", async () => {
    for (const birthday of ["--02-30", "--13-01", "1990-10-27", "27/10", 1027]) {
      const res = await request(app).post("/api/contacts").set(authHeaders(USER)).send({ ...base, birthday });
      expect(res.status, String(birthday)).toBe(400);
    }
    const leap = await request(app).post("/api/contacts").set(authHeaders(USER)).send({ ...base, birthday: "--02-29" });
    expect(leap.status).toBe(201);
  });

  it("keeps the birthday reminder switch, on by default", async () => {
    const initial = await request(app).get("/api/notifications/settings").set(authHeaders(USER));
    expect(initial.body.notifyBirthdays).toBe(true);

    const off = await request(app).put("/api/notifications/settings").set(authHeaders(USER)).send({ notifyBirthdays: false });
    expect(off.status).toBe(200);
    expect(off.body.notifyBirthdays).toBe(false);

    const read = await request(app).get("/api/notifications/settings").set(authHeaders(USER));
    expect(read.body.notifyBirthdays).toBe(false);
  });
});
