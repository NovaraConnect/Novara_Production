// ============================================================================
// Idempotent contact recalculation — used by the settings/career-goal update
// flow and the authenticated maintenance endpoint. Safe to run repeatedly.
//
//   • recomputes suggested priority for non-overridden contacts — AI-judged
//     semantic match when a provider key is set, deterministic keyword matcher
//     otherwise (and per-contact if an AI call fails)
//   • re-derives automatic cadence for non-cadence-overridden contacts
//   • never touches manually overridden priority or cadence
//   • writes only rows that actually change
//
// AI scoring runs with bounded concurrency so a career-goal save that
// re-matches every contact stays responsive and within free-tier rate limits.
// ============================================================================

import { pool } from "../db";
import { analyzeContactWithAI, isAiEnrichEnabled, type UserGoals } from "./enrich";
import { logger } from "./logger";
import {
  computeSuggestedPriority,
  deriveSuggestedCadence,
  normalizePriority,
  profileFromSettingsRow,
  type PriorityLevel,
  type UserProfessionalProfile,
} from "./priority";

export interface RecalcReport {
  examined: number;
  updated: number;
  priorityOverridesSkipped: number;
  cadenceOverridesSkipped: number;
  failures: number;
}

const SCORE_CONCURRENCY = 5;

interface ContactRow {
  id: string;
  company: string;
  role: string | null;
  function: string | null;
  industry: string | null;
  interests: string[] | null;
  goal_tags: string[] | null;
  notes: string | null;
  met_at: string | null;
  current_priority: string;
  priority_override: boolean;
  follow_up_cadence_days: number;
  cadence_override: boolean;
}

/** The suggested priority + (possibly enriched) industry/function for one
 *  contact: AI-judged match when available, deterministic fallback otherwise. */
async function scoreContact(
  c: ContactRow,
  profile: UserProfessionalProfile,
  goals: UserGoals,
  aiOn: boolean,
): Promise<{ priority: PriorityLevel; industry: string | null; function: string | null }> {
  const industry0 = c.industry ?? null;
  const function0 = c.function ?? null;

  if (aiOn) {
    const analysis = await analyzeContactWithAI(
      goals,
      { company: c.company, role: c.role, industry: industry0, function: function0, notes: c.notes, interests: c.interests ?? [] },
      (detail) => logger.warn({ detail, contactId: c.id }, "AI match (recalc) failed; using deterministic score"),
    );
    if (analysis) {
      return {
        priority: analysis.priority,
        industry: String(industry0 ?? "").trim() ? industry0 : analysis.industry,
        function: String(function0 ?? "").trim() ? function0 : analysis.function,
      };
    }
  }

  const priority = computeSuggestedPriority(
    {
      company: c.company,
      role: c.role,
      function: function0,
      industry: industry0,
      interests: c.interests ?? [],
      goalTags: c.goal_tags ?? [],
      notes: c.notes,
      metAt: c.met_at,
    },
    profile,
  );
  return { priority, industry: industry0, function: function0 };
}

export async function recalculateContactsForUser(userId: string): Promise<RecalcReport> {
  const report: RecalcReport = {
    examined: 0,
    updated: 0,
    priorityOverridesSkipped: 0,
    cadenceOverridesSkipped: 0,
    failures: 0,
  };

  const { rows: [settingsRow] } = await pool.query(
    "SELECT career_goals, career_statement, goal_tags FROM user_settings WHERE user_id = $1",
    [userId],
  );
  const profile = profileFromSettingsRow(settingsRow);
  const goals: UserGoals = {
    careerStatement: profile.careerStatement,
    careerGoals: profile.careerGoals,
    goalTags: profile.goalTags,
  };
  const aiOn = isAiEnrichEnabled();

  const { rows: contacts } = await pool.query<ContactRow>(
    `SELECT id, company, role, function, industry, interests, goal_tags, notes, met_at,
            current_priority, priority_override,
            follow_up_cadence_days, cadence_override
       FROM contacts WHERE user_id = $1`,
    [userId],
  );
  report.examined = contacts.length;

  const updates: {
    id: string;
    priority: string;
    cadence: number;
    industry: string | null;
    function: string | null;
  }[] = [];

  // Process in bounded-concurrency chunks so AI scoring of many contacts
  // doesn't run fully serially (slow) or fully parallel (rate limits).
  for (let i = 0; i < contacts.length; i += SCORE_CONCURRENCY) {
    const chunk = contacts.slice(i, i + SCORE_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (c) => {
        try {
          let priority: PriorityLevel;
          let industry = c.industry ?? null;
          let contactFunction = c.function ?? null;

          if (c.priority_override) {
            priority = normalizePriority(c.current_priority);
            report.priorityOverridesSkipped++;
          } else {
            const scored = await scoreContact(c, profile, goals, aiOn);
            priority = scored.priority;
            industry = scored.industry;
            contactFunction = scored.function;
          }

          let cadence: number;
          if (c.cadence_override) {
            cadence = c.follow_up_cadence_days;
            report.cadenceOverridesSkipped++;
          } else {
            cadence = deriveSuggestedCadence(priority);
          }

          const priorityChanged = !c.priority_override && priority !== c.current_priority;
          const cadenceChanged = !c.cadence_override && cadence !== c.follow_up_cadence_days;
          const industryChanged = (industry ?? null) !== (c.industry ?? null);
          const functionChanged = (contactFunction ?? null) !== (c.function ?? null);
          if (priorityChanged || cadenceChanged || industryChanged || functionChanged) {
            return { id: c.id, priority, cadence, industry, function: contactFunction };
          }
          return null;
        } catch {
          report.failures++;
          return null;
        }
      }),
    );
    for (const r of chunkResults) if (r) updates.push(r);
  }

  if (updates.length > 0) {
    await pool.query(
      `UPDATE contacts SET
         current_priority = u.priority,
         follow_up_cadence_days = u.cadence,
         industry = u.industry,
         function = u.function,
         updated_at = NOW()
       FROM UNNEST($1::uuid[], $2::text[], $3::int[], $4::text[], $5::text[])
            AS u(id, priority, cadence, industry, function)
       WHERE contacts.id = u.id`,
      [
        updates.map((u) => u.id),
        updates.map((u) => u.priority),
        updates.map((u) => u.cadence),
        updates.map((u) => u.industry),
        updates.map((u) => u.function),
      ],
    );
    report.updated = updates.length;
  }

  return report;
}
