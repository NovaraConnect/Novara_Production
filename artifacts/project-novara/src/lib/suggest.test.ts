import { describe, it, expect } from "vitest";
// Import through the frontend's own module to prove the web layer uses the ONE
// canonical source of truth — identical results to the backend (parity).
import {
  computeSuggestedPriority,
  deriveSuggestedCadence,
  getEffectiveCadence,
  getEffectivePriority,
  MANUAL_CADENCE_OPTIONS,
  suggestPriority,
} from "./suggest";

const PROFILE = { careerGoals: ["beauty"], careerStatement: "Sales at Estée Lauder" };

describe("frontend priority parity with canonical source of truth", () => {
  it("Sales at Estée Lauder → High (accent-folded)", () => {
    expect(computeSuggestedPriority({ company: "Estée Lauder", role: "Sales", industry: "Beauty" }, PROFILE)).toBe("High");
  });
  it("Marketing at Estée Lauder → Medium", () => {
    expect(computeSuggestedPriority({ company: "Estée Lauder", role: "Marketing", industry: "Beauty" }, PROFILE)).toBe("Medium");
  });
  it("Sales at another beauty company → High (role+industry both count)", () => {
    expect(computeSuggestedPriority({ company: "L'Oréal", role: "Sales", industry: "Beauty" }, PROFILE)).toBe("High");
  });
  it("Tesla Product Manager → Low; investment banking → Low", () => {
    expect(computeSuggestedPriority({ company: "Tesla", role: "Product Manager", industry: "Automotive" }, PROFILE)).toBe("Low");
    expect(computeSuggestedPriority({ company: "Goldman Sachs", role: "Analyst", industry: "Finance" }, PROFILE)).toBe("Low");
  });
  it("suggestPriority wrapper matches computeSuggestedPriority", () => {
    expect(suggestPriority({ company: "Estée Lauder", role: "Sales" }, PROFILE).importance).toBe("High");
  });
});

describe("frontend cadence parity", () => {
  it("High→21 Medium→42 Low→90 and manual options", () => {
    expect(deriveSuggestedCadence("High")).toBe(21);
    expect(deriveSuggestedCadence("Medium")).toBe(42);
    expect(deriveSuggestedCadence("Low")).toBe(90);
    expect([...MANUAL_CADENCE_OPTIONS]).toEqual([21, 30, 42, 60, 90, 180]);
  });
  it("manual overrides win", () => {
    expect(getEffectivePriority("Low", "High")).toBe("High");
    expect(getEffectiveCadence(21, 180)).toBe(180);
    expect(getEffectiveCadence(42, null)).toBe(42);
  });
});
