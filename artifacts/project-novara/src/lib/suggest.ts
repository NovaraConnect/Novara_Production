// ============================================================================
// Frontend priority/cadence — delegates to the ONE canonical source of truth
// (@workspace/novara-priority), the same module the backend uses. There is no
// second scoring or cadence implementation here: the removed heuristic
// (suggestImportance with hard-coded "generic high" role/company lists) and the
// duplicated calculatePriority/cadence tables are gone.
// ============================================================================

import {
  computeSuggestedPriority,
  type PriorityContact,
  type UserProfessionalProfile,
  type PriorityLevel,
} from "@workspace/novara-priority";

/** Strict exact-value guard for the priority enum. Rejects "", wrong case,
 *  null/undefined — the values a required <Select> must never be driven to. */
export function isPriorityLevel(value: unknown): value is PriorityLevel {
  return value === "High" || value === "Medium" || value === "Low";
}

/** Resolve the Base Priority a contact's edit form should load with. Prefers
 *  the stored basePriority, then legacy importance; only falls back to "Medium"
 *  when neither is a valid level (never returns "" for a required enum, and
 *  never overwrites a valid stored value). */
export function resolveFormPriority(
  contact: { basePriority?: unknown; importance?: unknown },
): PriorityLevel {
  if (isPriorityLevel(contact.basePriority)) return contact.basePriority;
  if (isPriorityLevel(contact.importance)) return contact.importance;
  return "Medium";
}

export {
  computeSuggestedPriority,
  deriveSuggestedCadence,
  getEffectivePriority,
  getEffectiveCadence,
  normalizePriority,
  cadenceLabel,
  MANUAL_CADENCE_OPTIONS,
  SUGGESTED_CADENCE_DAYS,
  type PriorityLevel,
  type PriorityContact,
  type UserProfessionalProfile,
} from "@workspace/novara-priority";

/**
 * First reach-out window (1–3 days) — a distinct concept from the recurring
 * cadence, so it stays here rather than in the shared priority module.
 */
export function suggestInitialFollowUp(
  importance: PriorityLevel,
): { days: 1 | 2 | 3; reason: string } {
  if (importance === "High") return { days: 1, reason: "High-priority contact — reach out within 24 hours" };
  if (importance === "Medium") return { days: 2, reason: "Reach out within 48 hours to stay warm" };
  return { days: 3, reason: "72 hours gives both of you time to settle" };
}

/**
 * Convenience wrapper for the Add/Edit Contact preview: returns the canonical
 * suggested priority plus a short, honest explanation (a deterministic
 * suggestion — never labelled "AI selected").
 */
export function suggestPriority(
  contact: PriorityContact,
  profile: UserProfessionalProfile,
): { importance: PriorityLevel; reason: string } {
  const importance = computeSuggestedPriority(contact, profile);
  const reason =
    importance === "High"
      ? "Strong match with your target role and company"
      : importance === "Medium"
        ? "Partial match with your career goals"
        : "No strong overlap with your career goals";
  return { importance, reason };
}
