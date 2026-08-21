import { describe, it, expect } from "vitest";
import { resolveFormPriority, isPriorityLevel } from "./suggest";

// Regression: Edit Contact must load Base Priority correctly for an existing
// contact at each priority, and the form value must never be "" for the
// required enum (the production "Invalid enum value ... received ''" bug).
describe("resolveFormPriority — loading an existing contact", () => {
  for (const level of ["High", "Medium", "Low"] as const) {
    it(`loads a stored basePriority of ${level} unchanged`, () => {
      expect(resolveFormPriority({ basePriority: level, importance: level })).toBe(level);
    });
  }

  it("never returns '' — falls back to legacy importance, then Medium", () => {
    // basePriority missing but legacy importance valid → use importance (no overwrite of valid data)
    expect(resolveFormPriority({ basePriority: "", importance: "High" })).toBe("High");
    expect(resolveFormPriority({ basePriority: undefined, importance: "Low" })).toBe("Low");
    // neither valid → last-resort Medium (never "")
    expect(resolveFormPriority({ basePriority: "", importance: "" })).toBe("Medium");
    expect(resolveFormPriority({})).toBe("Medium");
    // a valid stored basePriority is never overwritten by the fallback chain
    expect(resolveFormPriority({ basePriority: "Low", importance: "High" })).toBe("Low");
  });
});

describe("isPriorityLevel — Select onValueChange guard", () => {
  it("accepts exactly High | Medium | Low", () => {
    expect(isPriorityLevel("High")).toBe(true);
    expect(isPriorityLevel("Medium")).toBe(true);
    expect(isPriorityLevel("Low")).toBe(true);
  });
  it("rejects the empty string and other junk (so it can't clear a required field)", () => {
    expect(isPriorityLevel("")).toBe(false);
    expect(isPriorityLevel("low")).toBe(false);
    expect(isPriorityLevel(undefined)).toBe(false);
    expect(isPriorityLevel(null)).toBe(false);
  });
});
