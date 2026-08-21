import { Router } from "express";
import { pool, dbToContact } from "../db";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import type { Request, Response } from "express";
import {
  computeSuggestedPriority,
  deriveSuggestedCadence,
  normalizePriority,
  profileFromSettingsRow,
  type PriorityLevel,
} from "../lib/priority";
import { recalculateContactsForUser } from "../lib/recalculate";

const router = Router();

function toArrayLiteral(arr: string[]): string {
  if (!arr.length) return "{}";
  return `{${arr.map(t => `"${String(t).replace(/"/g, '\\"')}"`).join(",")}}`;
}

// GET /api/contacts
router.get("/contacts", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  try {
    const { rows } = await pool.query(
      "SELECT * FROM contacts WHERE user_id = $1 ORDER BY next_follow_up_date ASC",
      [userId],
    );
    res.json(rows.map(dbToContact));
  } catch {
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// POST /api/contacts/recalculate  — authenticated, idempotent maintenance.
// Recomputes AI Suggested Priority + automatic cadence for the caller's
// non-overridden contacts and returns a report. Safe to run repeatedly.
router.post("/contacts/recalculate", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  try {
    const report = await recalculateContactsForUser(userId);
    res.json({ ok: true, ...report });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "Recalculation failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// POST /api/contacts
router.post("/contacts", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const {
    firstName, lastName, linkedinUrl, email, phone, company, role, metAt,
    importance, initialFollowUpDays, followUpCadenceDays, goalTags, connectionStatus, notes,
    industry, function: contactFunction, interests,
    priorityOverride, currentPriority: manualPriority, cadenceOverride,
  } = req.body;

  if (!firstName || !lastName || !company) {
    res.status(400).json({ error: "firstName, lastName, company are required" });
    return;
  }

  const goalTagsArr: string[] = Array.isArray(goalTags) ? goalTags : [];
  const goalTagsLiteral = goalTagsArr.length ? toArrayLiteral(goalTagsArr) : "{}";
  const interestsArr: string[] = Array.isArray(interests) ? interests : [];
  const interestsLiteral = toArrayLiteral(interestsArr);

  const FREE_TIER_LIMIT = 25;

  try {
    const { rows: [countRow] } = await pool.query(
      "SELECT COUNT(*) AS count FROM contacts WHERE user_id = $1",
      [userId],
    );
    if (parseInt(countRow.count, 10) >= FREE_TIER_LIMIT) {
      res.status(403).json({
        error: "Contact limit reached",
        message: `You've reached the ${FREE_TIER_LIMIT}-contact limit for the beta. More spots are coming soon!`,
        code: "CONTACT_LIMIT_REACHED",
      });
      return;
    }

    const { rows: [settingsRow] } = await pool.query(
      "SELECT career_goals, career_statement, goal_tags FROM user_settings WHERE user_id = $1",
      [userId],
    );
    const profile = profileFromSettingsRow(settingsRow);

    const basePriority = normalizePriority(importance, "Medium");
    const suggestedPriority = computeSuggestedPriority(
      {
        company: company || null,
        role: role || null,
        industry: industry || null,
        function: contactFunction || null,
        interests: interestsArr,
        goalTags: goalTagsArr,
        notes: notes || null,
        metAt: metAt || null,
      },
      profile,
    );

    // effectivePriority = manualPriorityOverride ?? aiSuggestedPriority
    const isPriorityOverride = Boolean(priorityOverride);
    const effectivePriority: PriorityLevel = isPriorityOverride
      ? normalizePriority(manualPriority ?? importance, suggestedPriority)
      : suggestedPriority;

    // effectiveCadence = manualCadenceOverride ?? deriveSuggestedCadence(effectivePriority)
    const isCadenceOverride = Boolean(cadenceOverride);
    const effectiveCadence = isCadenceOverride && followUpCadenceDays
      ? Number(followUpCadenceDays)
      : deriveSuggestedCadence(effectivePriority);

    const { rows: [contact] } = await pool.query(
      `INSERT INTO contacts (
        user_id, first_name, last_name, linkedin_url, email, phone, company, role, met_at,
        importance, base_priority, current_priority, priority_override,
        industry, function, interests,
        initial_follow_up_days, follow_up_cadence_days, cadence_override,
        goal_tags, connection_status,
        first_contact_date, last_interaction_date, next_follow_up_date, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $10, $11, $12,
        $13, $14, $15::text[],
        $16, $17, $18,
        $19::text[], $20,
        CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + (($16)::int * INTERVAL '1 day'), $21
      ) RETURNING *`,
      [
        userId, firstName, lastName, linkedinUrl || null, email || null, phone || null,
        company, role || null, metAt || null,
        basePriority, effectivePriority, isPriorityOverride,
        industry || null, contactFunction || null, interestsLiteral,
        initialFollowUpDays || 7, effectiveCadence, isCadenceOverride,
        goalTagsLiteral, connectionStatus || "connected",
        notes || null,
      ],
    );
    res.status(201).json(dbToContact(contact));
  } catch (err) {
    console.error("[contacts POST] DB error:", err);
    res.status(500).json({ error: "Failed to create contact", detail: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/contacts/:id
router.get("/contacts/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const { id } = req.params;
  try {
    const { rows: [contact] } = await pool.query(
      "SELECT * FROM contacts WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json(dbToContact(contact));
  } catch {
    res.status(500).json({ error: "Failed to fetch contact" });
  }
});

// PUT /api/contacts/:id
router.put("/contacts/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const { id } = req.params;
  const {
    firstName, lastName, linkedinUrl, email, phone, company, role, metAt,
    importance, initialFollowUpDays, followUpCadenceDays, goalTags, connectionStatus,
    nextFollowUpDate, notes,
    industry, function: contactFunction, interests,
    priorityOverride, currentPriority: manualPriority, cadenceOverride,
  } = req.body;

  try {
    const [existingResult, settingsResult] = await Promise.all([
      pool.query("SELECT * FROM contacts WHERE id = $1 AND user_id = $2", [id, userId]),
      pool.query("SELECT career_goals, career_statement, goal_tags FROM user_settings WHERE user_id = $1", [userId]),
    ]);

    if (!existingResult.rows[0]) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    const existing = existingResult.rows[0];
    const profile = profileFromSettingsRow(settingsResult.rows[0]);

    const finalCompany = company !== undefined ? (company || null) : existing.company;
    const finalRole = role !== undefined ? (role ?? null) : existing.role;
    const finalIndustry = industry !== undefined ? (industry || null) : existing.industry;
    const finalFunction = contactFunction !== undefined ? (contactFunction || null) : existing.function;
    const finalInterests: string[] = Array.isArray(interests) ? interests : (existing.interests ?? []);
    const finalGoalTags: string[] = Array.isArray(goalTags) ? goalTags : (existing.goal_tags ?? []);
    const finalBasePriority = normalizePriority(importance ?? existing.base_priority, "Medium");

    // ── Priority: manual override wins, otherwise the fresh AI suggestion ──
    const isPriorityOverride = priorityOverride !== undefined
      ? Boolean(priorityOverride)
      : Boolean(existing.priority_override);

    const suggestedPriority = computeSuggestedPriority(
      {
        company: finalCompany,
        role: finalRole,
        industry: finalIndustry,
        function: finalFunction,
        interests: finalInterests,
        goalTags: finalGoalTags,
        notes: notes !== undefined ? notes : existing.notes,
        metAt: metAt !== undefined ? metAt : existing.met_at,
      },
      profile,
    );

    const effectivePriority: PriorityLevel = isPriorityOverride
      ? normalizePriority(manualPriority ?? existing.current_priority, suggestedPriority)
      : suggestedPriority;

    // ── Cadence: manual override wins, otherwise derived from priority ──
    const isCadenceOverride = cadenceOverride !== undefined
      ? Boolean(cadenceOverride)
      : Boolean(existing.cadence_override);

    let effectiveCadence: number;
    if (isCadenceOverride) {
      // Manually overridden — persist the chosen value (or keep the existing one).
      effectiveCadence = followUpCadenceDays != null
        ? Number(followUpCadenceDays)
        : existing.follow_up_cadence_days;
    } else {
      // Automatic — always follows the (new) effective priority.
      effectiveCadence = deriveSuggestedCadence(effectivePriority);
    }

    const goalTagsLiteral = Array.isArray(goalTags) ? toArrayLiteral(goalTags) : null;
    const interestsLiteral = toArrayLiteral(finalInterests);

    const { rows: [contact] } = await pool.query(
      `UPDATE contacts SET
        first_name = COALESCE($3, first_name),
        last_name = COALESCE($4, last_name),
        linkedin_url = $5,
        email = $6,
        phone = $7,
        company = COALESCE($8, company),
        role = $9,
        met_at = $10,
        importance = $11,
        base_priority = $11,
        current_priority = $12,
        priority_override = $13,
        industry = $14,
        function = $15,
        interests = $16::text[],
        initial_follow_up_days = COALESCE($17, initial_follow_up_days),
        follow_up_cadence_days = $18,
        cadence_override = $19,
        goal_tags = COALESCE($20::text[], goal_tags),
        connection_status = COALESCE($21, connection_status),
        next_follow_up_date = COALESCE($22::date, next_follow_up_date),
        notes = $23,
        updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
      [
        id, userId,
        firstName || null, lastName || null,
        linkedinUrl ?? null, email ?? null, phone ?? null,
        company || null, role ?? null, metAt ?? null,
        finalBasePriority, effectivePriority, isPriorityOverride,
        finalIndustry, finalFunction, interestsLiteral,
        initialFollowUpDays || null, effectiveCadence, isCadenceOverride,
        goalTagsLiteral, connectionStatus || null,
        nextFollowUpDate ? nextFollowUpDate.split("T")[0] : null,
        notes ?? null,
      ],
    );
    res.json(dbToContact(contact));
  } catch (err) {
    console.error("[contacts PUT] DB error:", err);
    res.status(500).json({ error: "Failed to update contact", detail: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/contacts/:id
router.delete("/contacts/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM contacts WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    if (!rowCount) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

// POST /api/contacts/:id/mark-contacted
router.post("/contacts/:id/mark-contacted", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const { id } = req.params;

  try {
    const { rows: [settings] } = await pool.query(
      "SELECT auto_downgrade_after_months FROM user_settings WHERE user_id = $1",
      [userId],
    );
    const downgradeMonths = settings?.auto_downgrade_after_months ?? 6;

    const { rows: [contact] } = await pool.query(
      `UPDATE contacts SET
        last_interaction_date = CURRENT_DATE,
        next_follow_up_date = CASE
          WHEN (CURRENT_DATE - first_contact_date) >= ($3 * 30)
            THEN CURRENT_DATE + INTERVAL '180 days'
          ELSE CURRENT_DATE + (follow_up_cadence_days || ' days')::INTERVAL
        END,
        updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
      [id, userId, downgradeMonths],
    );
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json(dbToContact(contact));
  } catch (err) {
    console.error("[contacts mark-contacted] DB error:", err);
    res.status(500).json({ error: "Failed to mark contact", detail: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/contacts/import  (localStorage migration)
router.post("/contacts/import", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const { contacts } = req.body;

  if (!Array.isArray(contacts)) {
    res.status(400).json({ error: "contacts must be an array" });
    return;
  }

  const { rows: [settingsRow] } = await pool.query(
    "SELECT career_goals, career_statement, goal_tags FROM user_settings WHERE user_id = $1",
    [userId],
  );
  const profile = profileFromSettingsRow(settingsRow);

  let imported = 0;
  let skipped = 0;

  for (const c of contacts) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const firstContactDate = c.firstContactDate ?? c.createdAt?.split("T")[0] ?? today;
      const lastInteractionDate = c.lastInteractionDate?.split("T")[0] ?? today;
      const nextFollowUpDate = c.nextFollowUpDate?.split("T")[0] ?? today;

      // Imports run through the same canonical priority/cadence logic.
      const basePriority = normalizePriority(c.importance, "Medium");
      const isPriorityOverride = Boolean(c.priorityOverride);
      const suggestedPriority = computeSuggestedPriority(
        {
          company: c.company ?? null,
          role: c.role ?? null,
          industry: c.industry ?? null,
          function: c.function ?? null,
          interests: Array.isArray(c.interests) ? c.interests : [],
          notes: c.notes ?? null,
          metAt: c.metAt ?? null,
        },
        profile,
      );
      const effectivePriority = isPriorityOverride
        ? normalizePriority(c.currentPriority ?? c.importance, suggestedPriority)
        : suggestedPriority;
      const isCadenceOverride = Boolean(c.cadenceOverride);
      const effectiveCadence = isCadenceOverride && c.followUpCadenceDays
        ? Number(c.followUpCadenceDays)
        : deriveSuggestedCadence(effectivePriority);

      const { rowCount } = await pool.query(
        `INSERT INTO contacts (
          user_id, first_name, last_name, linkedin_url, company, role, met_at,
          importance, base_priority, current_priority, priority_override,
          initial_follow_up_days, follow_up_cadence_days, cadence_override,
          first_contact_date, last_interaction_date, next_follow_up_date, notes, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $8, $9, $10,
          $11, $12, $13,
          $14, $15, $16, $17, $18
        ) ON CONFLICT DO NOTHING`,
        [
          userId,
          c.firstName ?? "", c.lastName ?? "",
          c.linkedinUrl ?? null, c.company ?? "", c.role ?? null, c.metAt ?? null,
          basePriority, effectivePriority, isPriorityOverride,
          c.initialFollowUpDays ?? 7, effectiveCadence, isCadenceOverride,
          firstContactDate, lastInteractionDate, nextFollowUpDate,
          c.notes ?? null,
          c.createdAt ?? new Date().toISOString(),
        ],
      );
      if (rowCount && rowCount > 0) imported++;
      else skipped++;
    } catch {
      skipped++;
    }
  }

  res.json({ imported, skipped });
});

export default router;
