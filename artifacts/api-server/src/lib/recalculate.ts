// ============================================================================
// Idempotent contact recalculation — the single mechanism used both by the
// settings/career-goal update flow and by the authenticated maintenance
// endpoint. Safe to run repeatedly; performs no destructive operations.
//
//   • recomputes AI Suggested Priority for non-overridden contacts
//   • re-derives automatic cadence for non-cadence-overridden contacts
//   • never touches manually overridden priority or cadence
//   • writes only rows that actually change
// ============================================================================

import { pool } from "../db";
import {
  computeSuggestedPriority,
  deriveSuggestedCadence,
  normalizePriority,
  profileFromSettingsRow,
  type PriorityLevel,
} from "./priority";

export interface RecalcReport {
  examined: number;
  updated: number;
  priorityOverridesSkipped: number;
  cadenceOverridesSkipped: number;
  failures: number;
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

  const { rows: contacts } = await pool.query(
    `SELECT id, company, role, function, industry, interests, goal_tags, notes, met_at,
            current_priority, priority_override,
            follow_up_cadence_days, cadence_override
       FROM contacts WHERE user_id = $1`,
    [userId],
  );

  const updates: { id: string; priority: string; cadence: number }[] = [];

  for (const c of contacts) {
    report.examined++;
    try {
      // ── Effective priority: manual override frozen, else AI suggestion ──
      let effectivePriority: PriorityLevel;
      if (c.priority_override) {
        effectivePriority = normalizePriority(c.current_priority);
        report.priorityOverridesSkipped++;
      } else {
        effectivePriority = computeSuggestedPriority(
          {
            company: c.company,
            role: c.role,
            function: c.function,
            industry: c.industry,
            interests: c.interests ?? [],
            goalTags: c.goal_tags ?? [],
            notes: c.notes,
            metAt: c.met_at,
          },
          profile,
        );
      }

      // ── Effective cadence: manual override frozen, else derived ─────────
      let cadence: number;
      if (c.cadence_override) {
        cadence = c.follow_up_cadence_days;
        report.cadenceOverridesSkipped++;
      } else {
        cadence = deriveSuggestedCadence(effectivePriority);
      }

      const priorityChanged = !c.priority_override && effectivePriority !== c.current_priority;
      const cadenceChanged = !c.cadence_override && cadence !== c.follow_up_cadence_days;
      if (priorityChanged || cadenceChanged) {
        updates.push({ id: c.id, priority: effectivePriority, cadence });
      }
    } catch {
      report.failures++;
    }
  }

  if (updates.length > 0) {
    await pool.query(
      `UPDATE contacts SET
         current_priority = u.priority,
         follow_up_cadence_days = u.cadence,
         updated_at = NOW()
       FROM UNNEST($1::uuid[], $2::text[], $3::int[]) AS u(id, priority, cadence)
       WHERE contacts.id = u.id`,
      [updates.map((u) => u.id), updates.map((u) => u.priority), updates.map((u) => u.cadence)],
    );
    report.updated = updates.length;
  }

  return report;
}
