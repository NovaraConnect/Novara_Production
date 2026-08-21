import { Router } from "express";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";
import { recalculateContactsForUser } from "../lib/recalculate";

const router = Router();

function toArrayLiteral(arr: string[]): string {
  if (!arr.length) return "{}";
  return `{${arr.map(t => `"${String(t).replace(/"/g, '\\"')}"`).join(",")}}`;
}

// GET /api/settings
router.get("/settings", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  try {
    const { rows: [row] } = await pool.query(
      "SELECT * FROM user_settings WHERE user_id = $1",
      [userId],
    );

    if (!row) {
      res.json({
        autoDowngradeAfterMonths: 6,
        careerStatement: "",
        goalTags: [],
        careerGoals: [],
        hasSeenTutorial: false,
      });
      return;
    }

    res.json({
      autoDowngradeAfterMonths: row.auto_downgrade_after_months,
      careerStatement: row.career_statement,
      goalTags: row.goal_tags,
      careerGoals: row.career_goals ?? [],
      hasSeenTutorial: row.has_seen_tutorial ?? false,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// PUT /api/settings
//
// When any part of the professional profile changes (careerGoals, goalTags,
// careerStatement) we synchronously recalculate every non-overridden contact
// and return the completion report. The client can therefore refetch only
// after the recalculation is actually done — no hardcoded timeout, and errors
// surface in the response.
router.put("/settings", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const { autoDowngradeAfterMonths, careerStatement, goalTags, hasSeenTutorial, careerGoals } = req.body;

  const goalTagsParam = goalTags ? toArrayLiteral(goalTags) : null;
  const careerGoalsParam = careerGoals ? toArrayLiteral(careerGoals) : null;

  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO user_settings (user_id, auto_downgrade_after_months, career_statement, goal_tags, has_seen_tutorial, career_goals)
         VALUES ($1, COALESCE($2, 6), COALESCE($3, ''), COALESCE($4::text[], '{}'::text[]), COALESCE($5, FALSE), COALESCE($6::text[], '{}'::text[]))
       ON CONFLICT (user_id) DO UPDATE SET
         auto_downgrade_after_months = COALESCE($2, user_settings.auto_downgrade_after_months),
         career_statement = COALESCE($3, user_settings.career_statement),
         goal_tags = COALESCE($4::text[], user_settings.goal_tags),
         has_seen_tutorial = COALESCE($5, user_settings.has_seen_tutorial),
         career_goals = COALESCE($6::text[], user_settings.career_goals),
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        autoDowngradeAfterMonths ?? null,
        careerStatement ?? null,
        goalTagsParam,
        hasSeenTutorial ?? null,
        careerGoalsParam,
      ],
    );

    const careerProfileChanged =
      careerGoals !== undefined || goalTags !== undefined || careerStatement !== undefined;

    // Recalculate synchronously so the client knows when it's actually safe to
    // refetch, and so failures are visible rather than swallowed.
    let recalculation = null;
    if (careerProfileChanged) {
      try {
        recalculation = await recalculateContactsForUser(userId);
      } catch (recalcErr) {
        logger.error({ err: recalcErr, userId }, "Career-goal recalculation failed");
        res.json({
          autoDowngradeAfterMonths: row.auto_downgrade_after_months,
          careerStatement: row.career_statement,
          goalTags: row.goal_tags,
          careerGoals: row.career_goals ?? [],
          hasSeenTutorial: row.has_seen_tutorial ?? false,
          recalculation: { ok: false, error: recalcErr instanceof Error ? recalcErr.message : String(recalcErr) },
        });
        return;
      }
    }

    res.json({
      autoDowngradeAfterMonths: row.auto_downgrade_after_months,
      careerStatement: row.career_statement,
      goalTags: row.goal_tags,
      careerGoals: row.career_goals ?? [],
      hasSeenTutorial: row.has_seen_tutorial ?? false,
      recalculation: recalculation ? { ok: true, ...recalculation } : null,
    });
  } catch (err) {
    logger.error({ err, userId }, "Failed to save settings");
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
