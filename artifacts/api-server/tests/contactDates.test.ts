// When the user met someone and last spoke to them, end to end through the
// routes and Postgres. The rules themselves are unit-tested in
// tests/unit/followUpDates.test.ts; this proves the SQL stores and returns
// them, and that an edit only reschedules when a date actually moves.
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, authHeaders } from "./testApp";
import { pool } from "../src/db";
import { addDays, MAINTENANCE_DAYS, utcDateString } from "../src/lib/followUpDates";

const USER = "user_dates";
const TODAY = utcDateString();

function contact(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Grace",
    lastName: "Hopper",
    company: "Compiler Co",
    // A fixed cadence keeps the expected dates independent of priority scoring.
    cadenceOverride: true,
    followUpCadenceDays: 30,
    initialFollowUpDays: 2,
    ...overrides,
  };
}

async function create(overrides: Record<string, unknown> = {}) {
  return request(app).post("/api/contacts").set(authHeaders(USER)).send(contact(overrides));
}

async function edit(id: string, body: Record<string, unknown>) {
  return request(app).put(`/api/contacts/${id}`).set(authHeaders(USER)).send(body);
}

describe("contact dates — create", () => {
  it("without dates, behaves exactly as before: met and spoke today", async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.firstContactDate).toBe(TODAY);
    expect(res.body.lastInteractionDate).toBe(TODAY);
    expect(res.body.nextFollowUpDate).toBe(addDays(TODAY, 2));
  });

  it("someone met two years ago and never followed up arrives overdue, not Warm", async () => {
    const met = addDays(TODAY, -730);
    const res = await create({ firstContactDate: met, lastInteractionDate: "" });
    expect(res.status).toBe(201);
    expect(res.body.firstContactDate).toBe(met);
    expect(res.body.lastInteractionDate).toBe(met);
    expect(res.body.nextFollowUpDate).toBe(addDays(met, 2));
    expect(res.body.nextFollowUpDate < TODAY).toBe(true);
  });

  it("recent relationship: schedules from the last conversation", async () => {
    const met = addDays(TODAY, -40);
    const spoke = addDays(TODAY, -10);
    const res = await create({ firstContactDate: met, lastInteractionDate: spoke });
    expect(res.status).toBe(201);
    expect(res.body.nextFollowUpDate).toBe(addDays(spoke, 30));
  });

  it("long relationship: switches to the maintenance interval", async () => {
    const spoke = addDays(TODAY, -10);
    const res = await create({ firstContactDate: addDays(TODAY, -730), lastInteractionDate: spoke });
    expect(res.status).toBe(201);
    expect(res.body.nextFollowUpDate).toBe(addDays(spoke, MAINTENANCE_DAYS));
  });

  it("rejects last-spoke before the met date, and stores nothing", async () => {
    const res = await create({ firstContactDate: addDays(TODAY, -5), lastInteractionDate: addDays(TODAY, -9) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_CONTACT_DATES");
    const list = await request(app).get("/api/contacts").set(authHeaders(USER));
    expect(list.body).toHaveLength(0);
  });

  it("rejects dates in the future", async () => {
    const res = await create({ firstContactDate: addDays(TODAY, 10) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_CONTACT_DATES");
  });
});

describe("contact dates — edit", () => {
  it("moving the dates reschedules from the new dates", async () => {
    const created = await create();
    const met = addDays(TODAY, -60);
    const spoke = addDays(TODAY, -20);
    const res = await edit(created.body.id, { ...contact(), firstContactDate: met, lastInteractionDate: spoke });
    expect(res.status).toBe(200);
    expect(res.body.firstContactDate).toBe(met);
    expect(res.body.lastInteractionDate).toBe(spoke);
    expect(res.body.nextFollowUpDate).toBe(addDays(spoke, 30));
  });

  it("an edit that leaves the dates alone does not move the follow-up", async () => {
    const created = await create({ firstContactDate: addDays(TODAY, -40), lastInteractionDate: addDays(TODAY, -10) });
    const before = created.body.nextFollowUpDate;

    // Dates omitted entirely…
    const a = await edit(created.body.id, { ...contact(), notes: "Changed a note" });
    expect(a.status).toBe(200);
    expect(a.body.nextFollowUpDate).toBe(before);

    // …and the same dates sent back, which is what the Edit form does.
    const b = await edit(created.body.id, {
      ...contact(),
      notes: "Changed it again",
      firstContactDate: created.body.firstContactDate,
      lastInteractionDate: created.body.lastInteractionDate,
    });
    expect(b.status).toBe(200);
    expect(b.body.nextFollowUpDate).toBe(before);
  });

  it("a blank last-spoke on edit means 'not since we met'", async () => {
    const created = await create({ firstContactDate: addDays(TODAY, -40), lastInteractionDate: addDays(TODAY, -10) });
    const res = await edit(created.body.id, {
      ...contact(),
      firstContactDate: created.body.firstContactDate,
      lastInteractionDate: "",
    });
    expect(res.status).toBe(200);
    expect(res.body.lastInteractionDate).toBe(created.body.firstContactDate);
  });

  it("rejects an edit that puts last-spoke before the met date", async () => {
    const created = await create();
    const res = await edit(created.body.id, {
      ...contact(),
      firstContactDate: addDays(TODAY, -3),
      lastInteractionDate: addDays(TODAY, -8),
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_CONTACT_DATES");
  });

  it("an older row stored out of order stays editable", async () => {
    // The import path never checked ordering, so such rows exist.
    const created = await create();
    await pool.query(
      "UPDATE contacts SET first_contact_date = $2::date, last_interaction_date = $3::date WHERE id = $1",
      [created.body.id, addDays(TODAY, -5), addDays(TODAY, -30)],
    );
    const res = await edit(created.body.id, {
      ...contact(),
      notes: "Just fixing a typo",
      firstContactDate: addDays(TODAY, -5),
      lastInteractionDate: addDays(TODAY, -30),
    });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("Just fixing a typo");
  });
});
