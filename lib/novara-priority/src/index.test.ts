import assert from "node:assert/strict";
import test from "node:test";
import {
  MANUAL_CADENCE_OPTIONS,
  SUGGESTED_CADENCE_DAYS,
  computeSuggestedPriority,
  deriveSuggestedCadence,
  getEffectiveCadence,
  getEffectivePriority,
  normalizePriority,
  normalizeText,
  tokenize,
  cadenceLabel,
  type UserProfessionalProfile,
} from "./index.ts";

// The confirmed production profile: Sales at Estée Lauder, in beauty.
const PROFILE: UserProfessionalProfile = {
  careerGoals: ["beauty"],
  careerStatement: "Sales at Estée Lauder",
};

// ── Normalization ─────────────────────────────────────────────────────────
test("normalization folds accents and punctuation (Estée Lauder → estee lauder)", () => {
  assert.equal(normalizeText("Estée Lauder"), "estee lauder");
  assert.equal(normalizeText("L'Oréal"), "l oreal");
  assert.deepEqual(tokenize("Estée Lauder"), ["estee", "lauder"]);
  // Profile and contact data normalize identically.
  assert.equal(normalizeText("ESTÉE  LAUDER "), normalizeText("estee lauder"));
});

// ── Priority: the six required outcomes ─────────────────────────────────────
test("Carla Petrone — Sales at Estée Lauder → High", () => {
  assert.equal(
    computeSuggestedPriority(
      { company: "Estée Lauder", role: "Sales", industry: "Beauty" },
      PROFILE,
    ),
    "High",
  );
});

test("Marketing at Estée Lauder → Medium (company+industry, role mismatch)", () => {
  assert.equal(
    computeSuggestedPriority(
      { company: "Estée Lauder", role: "Marketing", industry: "Beauty" },
      PROFILE,
    ),
    "Medium",
  );
});

test("Sales at another major beauty company → High (role+industry both count as a match)", () => {
  assert.equal(
    computeSuggestedPriority(
      { company: "L'Oréal", role: "Sales", industry: "Beauty" },
      PROFILE,
    ),
    "High",
  );
});

test("Related beauty-industry decision maker → Medium (industry only)", () => {
  assert.equal(
    computeSuggestedPriority(
      { company: "Sephora", role: "VP Merchandising", industry: "Beauty" },
      PROFILE,
    ),
    "Medium",
  );
});

test("Elia Miga — Product Manager at Tesla → Low", () => {
  assert.equal(
    computeSuggestedPriority(
      { company: "Tesla", role: "Product Manager", industry: "Automotive" },
      PROFILE,
    ),
    "Low",
  );
});

test("Unrelated Revolut / investment-banking contact → Low", () => {
  assert.equal(
    computeSuggestedPriority(
      { company: "Revolut", role: "Software Engineer", industry: "Fintech" },
      PROFILE,
    ),
    "Low",
  );
  assert.equal(
    computeSuggestedPriority(
      { company: "Goldman Sachs", role: "Investment Banking Analyst", industry: "Finance" },
      PROFILE,
    ),
    "Low",
  );
});

// ── Priority: accent folding across BOTH profile and contact ────────────────
test("accent folding works whether the accent is on the profile or the contact", () => {
  // Accent only on contact side.
  assert.equal(
    computeSuggestedPriority(
      { company: "Estée Lauder", role: "Sales" },
      { careerStatement: "Sales at Estee Lauder" },
    ),
    "High",
  );
  // Accent only on profile side.
  assert.equal(
    computeSuggestedPriority(
      { company: "Estee Lauder", role: "Sales" },
      { careerStatement: "Sales at Estée Lauder" },
    ),
    "High",
  );
});

// ── Priority: Base Priority must NOT determine the Medium band ──────────────
test("Base Priority does not influence the suggested priority", () => {
  // computeSuggestedPriority takes no basePriority input at all: the same
  // contact/profile yields the same suggestion regardless of any stored base.
  const contact = { company: "Estée Lauder", role: "Marketing", industry: "Beauty" };
  const suggestion = computeSuggestedPriority(contact, PROFILE);
  assert.equal(suggestion, "Medium");
  // A stray "basePriority" property is ignored by the type-safe API.
  assert.equal(
    computeSuggestedPriority({ ...contact, basePriority: "High" } as never, PROFILE),
    "Medium",
  );
});

test("empty profile yields neutral Medium (no signal to rank on)", () => {
  assert.equal(computeSuggestedPriority({ company: "Anything", role: "Anything" }, {}), "Medium");
});

// ── normalizePriority always returns exactly one of the three ───────────────
test("normalizePriority coerces any value to High | Medium | Low", () => {
  assert.equal(normalizePriority("HIGH!!!"), "High");
  assert.equal(normalizePriority("low"), "Low");
  assert.equal(normalizePriority("Medium"), "Medium");
  assert.equal(normalizePriority("urgent"), "Medium"); // fallback
  assert.equal(normalizePriority(null, "Low"), "Low");
});

// ── Cadence mapping ─────────────────────────────────────────────────────────
test("cadence is derived only from effective priority: High→21 Medium→42 Low→90", () => {
  assert.equal(deriveSuggestedCadence("High"), 21);
  assert.equal(deriveSuggestedCadence("Medium"), 42);
  assert.equal(deriveSuggestedCadence("Low"), 90);
  assert.deepEqual(SUGGESTED_CADENCE_DAYS, { High: 21, Medium: 42, Low: 90 });
});

test("manual cadence options are 3wk / 1mo / 6wk / 2mo / 3mo / 6mo", () => {
  assert.deepEqual([...MANUAL_CADENCE_OPTIONS], [21, 30, 42, 60, 90, 180]);
  assert.equal(cadenceLabel(21), "Every 3 weeks");
  assert.equal(cadenceLabel(42), "Every 6 weeks");
  assert.equal(cadenceLabel(90), "Every 3 months");
});

// ── Effective priority / cadence override semantics ─────────────────────────
test("manual overrides win without erasing the AI suggestion", () => {
  assert.equal(getEffectivePriority("Low", "High"), "High"); // manual wins
  assert.equal(getEffectivePriority("Low", null), "Low"); // no override → AI
  assert.equal(getEffectiveCadence(21, 180), 180); // manual wins
  assert.equal(getEffectiveCadence(42, null), 42); // no override → AI
});

test("changing priority updates suggested cadence only when cadence is not overridden", () => {
  // Not overridden: cadence follows priority.
  const newPriority = "High" as const;
  assert.equal(getEffectiveCadence(deriveSuggestedCadence(newPriority), null), 21);
  // Overridden: priority change does not move cadence.
  assert.equal(getEffectiveCadence(deriveSuggestedCadence(newPriority), 90), 90);
});
