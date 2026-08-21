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
import { isAiEnrichEnabled, enrichBlanksBestEffort } from "./enrich";
import { logger } from "./logger";
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

  const updates: {
    id: string;
    priority: string;
    cadence: number;
    industry: string | null;
    function: string | null;
  }[] = [];

  // Best-effort AI backfill of blank industry/function, capped per run so this
  // stays responsive and within free-tier rate limits; remaining blanks are
  // filled on subsequent runs. Never throws.
  const aiOn = isAiEnrichEnabled();
  const ENRICH_CAP = 12;
  let enrichCount = 0;

  for (const c of contacts) {
    report.examined++;
    try {
      let industry: string | null = c.industry ?? null;
      let contactFunction: string | null = c.function ?? null;
      let facetsChanged = false;

      const missingFacet =
        String(industry ?? "").trim() === "" || String(contactFunction ?? "").trim() === "";
      if (aiOn && enrichCount < ENRICH_CAP && missingFacet) {
        enrichCount++;
        const enriched = await enrichBlanksBestEffort(
          { company: c.company, role: c.role, industry, function: contactFunction },
          (detail) => logger.warn({ detail, contactId: c.id }, "AI enrichment (recalc) failed"),
        );
        if (enriched.changed) {
          industry = enriched.industry;
          contactFunction = enriched.function;
          facetsChanged = true;
        }
      }

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
            function: contactFunction,
            industry,
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
      if (priorityChanged || cadenceChanged || facetsChanged) {
        updates.push({ id: c.id, priority: effectivePriority, cadence, industry, function: contactFunction });
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
