// The contact-dates rules, checked without a database. The routes are thin
// wrappers around these two functions, so this is where the behaviour lives.
import { describe, it, expect } from "vitest";
import {
  addDays,
  computeNextFollowUp,
  isValidDateString,
  MAINTENANCE_DAYS,
  resolveContactDates,
} from "../../src/lib/followUpDates";

const TODAY = "2026-09-21";

describe("isValidDateString", () => {
  it("accepts real calendar dates", () => {
    expect(isValidDateString("2026-09-21")).toBe(true);
    expect(isValidDateString("2028-02-29")).toBe(true); // leap day
  });

  it("rejects impossible dates and other shapes", () => {
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2027-02-29")).toBe(false); // not a leap year
    expect(isValidDateString("2026-9-21")).toBe(false);
    expect(isValidDateString("21/09/2026")).toBe(false);
    expect(isValidDateString("2026-09-21T00:00:00Z")).toBe(false);
    expect(isValidDateString(20260921)).toBe(false);
  });
});

describe("resolveContactDates — creating a contact", () => {
  it("defaults to met today, spoken today — the old behaviour", () => {
    expect(resolveContactDates({ today: TODAY })).toEqual({
      ok: true, firstContactDate: TODAY, lastInteractionDate: TODAY,
    });
  });

  it("treats a missing or blank last-spoke as 'haven't spoken since we met'", () => {
    for (const last of [undefined, null, ""]) {
      const r = resolveContactDates({ first: "2024-03-10", last, today: TODAY });
      expect(r).toEqual({ ok: true, firstContactDate: "2024-03-10", lastInteractionDate: "2024-03-10" });
    }
  });

  it("keeps both dates when both are given", () => {
    const r = resolveContactDates({ first: "2024-03-10", last: "2026-06-01", today: TODAY });
    expect(r).toEqual({ ok: true, firstContactDate: "2024-03-10", lastInteractionDate: "2026-06-01" });
  });

  it("rejects last-spoke before the day they met", () => {
    const r = resolveContactDates({ first: "2026-06-01", last: "2026-05-01", today: TODAY });
    expect(r.ok).toBe(false);
  });

  it("rejects future dates, with one day of slack for users east of UTC", () => {
    expect(resolveContactDates({ first: addDays(TODAY, 1), today: TODAY }).ok).toBe(true);
    expect(resolveContactDates({ first: addDays(TODAY, 2), today: TODAY }).ok).toBe(false);
    expect(resolveContactDates({ first: TODAY, last: addDays(TODAY, 5), today: TODAY }).ok).toBe(false);
  });

  it("rejects malformed dates instead of storing them", () => {
    expect(resolveContactDates({ first: "last tuesday", today: TODAY }).ok).toBe(false);
    expect(resolveContactDates({ first: TODAY, last: "2026-13-01", today: TODAY }).ok).toBe(false);
  });
});

describe("resolveContactDates — editing a contact", () => {
  const current = { first: "2025-01-15", last: "2026-04-02" };

  it("keeps the stored dates when the edit doesn't send them", () => {
    expect(resolveContactDates({ current, today: TODAY })).toEqual({
      ok: true, firstContactDate: current.first, lastInteractionDate: current.last,
    });
  });

  it("moves the met date without touching the stored last-spoke", () => {
    const r = resolveContactDates({ first: "2024-11-01", current, today: TODAY });
    expect(r).toEqual({ ok: true, firstContactDate: "2024-11-01", lastInteractionDate: current.last });
  });

  it("refuses a met date that would land after the stored last-spoke", () => {
    expect(resolveContactDates({ first: "2026-05-01", current, today: TODAY }).ok).toBe(false);
  });

  it("lets an unrelated edit through even when the stored pair is out of order", () => {
    // Rows written by the old import path can have last-spoke before met.
    const legacy = { first: "2026-05-01", last: "2026-04-01" };
    expect(resolveContactDates({ first: legacy.first, last: legacy.last, current: legacy, today: TODAY }))
      .toEqual({ ok: true, firstContactDate: legacy.first, lastInteractionDate: legacy.last });
  });

  it("still validates when someone changes such a pair", () => {
    const legacy = { first: "2026-05-01", last: "2026-04-01" };
    expect(resolveContactDates({ first: "2026-05-02", last: legacy.last, current: legacy, today: TODAY }).ok)
      .toBe(false);
  });
});

describe("computeNextFollowUp", () => {
  const base = { initialFollowUpDays: 2, cadenceDays: 21, downgradeMonths: 6, today: TODAY };

  it("met today and not spoken since → the first reach-out delay (unchanged default)", () => {
    expect(computeNextFollowUp({ ...base, firstContactDate: TODAY, lastInteractionDate: TODAY }))
      .toBe(addDays(TODAY, 2));
  });

  it("met two years ago and never followed up → long overdue, not 'due in 3 weeks'", () => {
    const next = computeNextFollowUp({ ...base, firstContactDate: "2024-09-21", lastInteractionDate: "2024-09-21" });
    expect(next).toBe("2024-09-23");
    expect(next < TODAY).toBe(true);
  });

  it("recent relationship → last spoke + cadence", () => {
    expect(computeNextFollowUp({ ...base, firstContactDate: "2026-07-01", lastInteractionDate: "2026-09-14" }))
      .toBe(addDays("2026-09-14", 21));
  });

  it("relationship older than the downgrade threshold → maintenance interval", () => {
    expect(computeNextFollowUp({ ...base, firstContactDate: "2024-01-01", lastInteractionDate: "2026-09-14" }))
      .toBe(addDays("2026-09-14", MAINTENANCE_DAYS));
  });

  it("switches to maintenance exactly at downgradeMonths × 30 days, as the SQL does (>=)", () => {
    const first = addDays(TODAY, -6 * 30);
    expect(computeNextFollowUp({ ...base, firstContactDate: first, lastInteractionDate: "2026-09-01" }))
      .toBe(addDays("2026-09-01", MAINTENANCE_DAYS));
    const justUnder = addDays(TODAY, -6 * 30 + 1);
    expect(computeNextFollowUp({ ...base, firstContactDate: justUnder, lastInteractionDate: "2026-09-01" }))
      .toBe(addDays("2026-09-01", 21));
  });

  it("agrees with mark-contacted's rule when last spoke is today", () => {
    // mark-contacted: next = today + (age >= months*30 ? 180 : cadence)
    const young = computeNextFollowUp({ ...base, firstContactDate: "2026-08-01", lastInteractionDate: TODAY });
    expect(young).toBe(addDays(TODAY, 21));
    const old = computeNextFollowUp({ ...base, firstContactDate: "2025-01-01", lastInteractionDate: TODAY });
    expect(old).toBe(addDays(TODAY, MAINTENANCE_DAYS));
  });

  it("does date arithmetic across month ends and leap days", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
