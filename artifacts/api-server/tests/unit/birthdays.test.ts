import { describe, it, expect } from "vitest";
import { isBirthdayToday } from "../../src/lib/scheduler";

const day = (iso: string) => new Date(`${iso}T09:00:00Z`);

describe("isBirthdayToday", () => {
  it("matches the month and day", () => {
    expect(isBirthdayToday("--10-27", day("2026-10-27"))).toBe(true);
  });

  it("does not match other days", () => {
    expect(isBirthdayToday("--10-26", day("2026-10-27"))).toBe(false);
    expect(isBirthdayToday("--11-27", day("2026-10-27"))).toBe(false);
  });

  it("ignores empty and malformed values", () => {
    expect(isBirthdayToday(null, day("2026-10-27"))).toBe(false);
    expect(isBirthdayToday("", day("2026-10-27"))).toBe(false);
    expect(isBirthdayToday("27/10", day("2026-10-27"))).toBe(false);
    expect(isBirthdayToday("1990-10-27", day("2026-10-27"))).toBe(false);
  });

  it("celebrates 29 February on 28 February in non-leap years only", () => {
    expect(isBirthdayToday("--02-29", day("2027-02-28"))).toBe(true);
    expect(isBirthdayToday("--02-29", day("2028-02-28"))).toBe(false);
    expect(isBirthdayToday("--02-29", day("2028-02-29"))).toBe(true);
  });
});
