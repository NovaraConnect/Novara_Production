import { describe, it, expect } from "vitest";
import { computeStatus } from "./utils";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

describe("computeStatus (relationship health, contact-object only)", () => {
  it("due today or in the future → Warm", () => {
    expect(computeStatus({ nextFollowUpDate: daysFromNow(0) })).toBe("Warm");
    expect(computeStatus({ nextFollowUpDate: daysFromNow(10) })).toBe("Warm");
  });
  it("1–30 days overdue → Cooling", () => {
    expect(computeStatus({ nextFollowUpDate: daysFromNow(-1) })).toBe("Cooling");
    expect(computeStatus({ nextFollowUpDate: daysFromNow(-30) })).toBe("Cooling");
  });
  it("31–90 days overdue → Cold", () => {
    expect(computeStatus({ nextFollowUpDate: daysFromNow(-31) })).toBe("Cold");
    expect(computeStatus({ nextFollowUpDate: daysFromNow(-90) })).toBe("Cold");
  });
  it("more than 90 days overdue → Dormant", () => {
    expect(computeStatus({ nextFollowUpDate: daysFromNow(-91) })).toBe("Dormant");
    expect(computeStatus({ nextFollowUpDate: daysFromNow(-400) })).toBe("Dormant");
  });
  it("missing nextFollowUpDate → Cold", () => {
    expect(computeStatus({ nextFollowUpDate: null })).toBe("Cold");
    expect(computeStatus({})).toBe("Cold");
  });
  // Type-level guarantee: computeStatus only accepts a contact-shaped object.
  // Passing a raw date string is a TypeScript compile error (the legacy
  // string signature was removed) — see lib/utils.ts.
});
