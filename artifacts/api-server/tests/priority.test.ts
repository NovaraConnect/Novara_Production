import { describe, it, expect } from "vitest";
// Import via the backend re-export to prove the server uses the ONE canonical
// source of truth (@workspace/novara-priority) — no second implementation.
import {
  computeSuggestedPriority,
  deriveSuggestedCadence,
  getEffectiveCadence,
  getEffectivePriority,
  MANUAL_CADENCE_OPTIONS,
} from "../src/lib/priority";

const PROFILE = { careerGoals: ["beauty"], careerStatement: "Sales at Estée Lauder" };

describe("backend uses the canonical priority source of truth", () => {
  it("Carla — Sales at Estée Lauder → High", () => {
    expect(computeSuggestedPriority({ company: "Estée Lauder", role: "Sales", industry: "Beauty" }, PROFILE)).toBe("High");
  });
  it("Marketing at Estée Lauder → Medium", () => {
    expect(computeSuggestedPriority({ company: "Estée Lauder", role: "Marketing", industry: "Beauty" }, PROFILE)).toBe("Medium");
  });
  it("Sales at another beauty company → High (role+industry both count)", () => {
    expect(computeSuggestedPriority({ company: "L'Oréal", role: "Sales", industry: "Beauty" }, PROFILE)).toBe("High");
  });
  it("Tesla Product Manager → Low", () => {
    expect(computeSuggestedPriority({ company: "Tesla", role: "Product Manager", industry: "Automotive" }, PROFILE)).toBe("Low");
  });
  it("cadence derives High→21 Medium→42 Low→90", () => {
    expect(deriveSuggestedCadence("High")).toBe(21);
    expect(deriveSuggestedCadence("Medium")).toBe(42);
    expect(deriveSuggestedCadence("Low")).toBe(90);
  });
  it("effective priority/cadence honour manual overrides", () => {
    expect(getEffectivePriority("Low", "High")).toBe("High");
    expect(getEffectiveCadence(21, 180)).toBe(180);
    expect([...MANUAL_CADENCE_OPTIONS]).toEqual([21, 30, 42, 60, 90, 180]);
  });
});
