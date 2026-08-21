// ============================================================================
// Backend priority/cadence — re-exports the ONE canonical source of truth.
//
// There is intentionally no priority or cadence logic in this file. Every
// backend workflow (contact create/edit/import, career-goal recalculation,
// maintenance recalculation) imports from here, which forwards to the shared
// @workspace/novara-priority package that the frontend also uses. Keeping this
// re-export means existing `../lib/priority` import paths stay valid.
// ============================================================================

export {
  PRIORITY_LEVELS,
  SUGGESTED_CADENCE_DAYS,
  MANUAL_CADENCE_OPTIONS,
  computeSuggestedPriority,
  deriveSuggestedCadence,
  getEffectivePriority,
  getEffectiveCadence,
  normalizePriority,
  normalizeText,
  tokenize,
  cadenceLabel,
  type PriorityLevel,
  type ManualCadenceDays,
  type PriorityContact,
  type UserProfessionalProfile,
} from "@workspace/novara-priority";

import type { UserProfessionalProfile } from "@workspace/novara-priority";

/** Build the canonical professional profile from a user_settings row. This is
 *  the single place the backend maps DB settings → the profile shape consumed
 *  by computeSuggestedPriority. */
export function profileFromSettingsRow(row: {
  career_goals?: string[] | null;
  career_statement?: string | null;
  goal_tags?: string[] | null;
} | null | undefined): UserProfessionalProfile {
  return {
    careerGoals: row?.career_goals ?? [],
    careerStatement: row?.career_statement ?? "",
    goalTags: row?.goal_tags ?? [],
  };
}
