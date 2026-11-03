import { Router, type Request, type Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { pool, toDateStr } from "../db";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { requireSubscription } from "../middlewares/subscription";
import { proStatusFor } from "../lib/entitlements";
import { withAiBudget } from "../lib/aiBudget";
import { takeDraft } from "../lib/usageLimits";
import {
  activeMessageProvider,
  isSuggestedMessageAiEnabled,
  suggestMessage,
  suggestedMessageLogFields,
  type SuggestionInput,
  type TemplateReason,
} from "../lib/suggestedMessage";

const router = Router();

// Auth-gated AND rate-limited so Regenerate can't turn this into an open LLM
// proxy. The real ceilings are the daily and monthly limits below.
const suggestedMessageLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (req as AuthedRequest).userId ?? ipKeyGenerator(req.ip ?? "unknown"),
});

// POST /api/contacts/:id/suggested-message  { headline? }
// Always answers with one draft — { subject, message, source } — that works
// as a text, email, or LinkedIn message: the AI one for subscribers within the
// daily cap when a provider is configured, else the deterministic template.
// Never sends anything; the client shows it for the user to edit and send.
router.post(
  "/contacts/:id/suggested-message",
  requireAuth,
  requireSubscription,
  suggestedMessageLimiter,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).userId;
    const id = String(req.params["id"]);
    const headline = typeof req.body?.headline === "string" ? req.body.headline.slice(0, 300) : null;

    try {
      const { rows: [contact] } = await pool.query(
        "SELECT * FROM contacts WHERE id = $1 AND user_id = $2",
        [id, userId],
      );
      if (!contact) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }
      const { rows: [settings] } = await pool.query(
        "SELECT career_statement, career_goals FROM user_settings WHERE user_id = $1",
        [userId],
      );

      // AI drafts cost money, so only an active subscription or trial gets
      // them (in that order of checks, so the cap isn't spent on a refusal).
      let reason: TemplateReason | null = null;
      if (!isSuggestedMessageAiEnabled()) reason = "ai_off";
      else if (!(await proStatusFor(userId)).pro) reason = "not_subscribed";
      else if (!(await takeDraft(userId, id))) reason = "daily_cap";

      const input: SuggestionInput = {
        firstName: contact.first_name,
        company: contact.company,
        role: contact.role,
        metAt: contact.met_at,
        firstContactDate: contact.first_contact_date ? toDateStr(contact.first_contact_date) : null,
        lastInteractionDate: contact.last_interaction_date ? toDateStr(contact.last_interaction_date) : null,
        notes: contact.notes,
        birthday: contact.birthday ?? null,
        headline,
        careerStatement: settings?.career_statement ?? null,
        careerGoals: settings?.career_goals ?? [],
        // marked_contacted_at exists once migration 0011 is applied.
        hasReachedOut: !!contact.marked_contacted_at,
      };

      const t0 = Date.now();
      // The monthly cap covers every AI feature; the daily limit above stops one
      // user's Regenerate burst from using it all up in an afternoon.
      const budgeted = reason === null
        ? await withAiBudget(userId, () => suggestMessage(input, true))
        : ({ allowed: false } as const);
      if (reason === null && !budgeted.allowed) reason = "monthly_cap";
      const result = budgeted.allowed ? budgeted.value : await suggestMessage(input, false);
      const provider = reason ? null : activeMessageProvider();

      // METADATA ONLY — never the notes, the prompt, or the draft.
      console.log(
        "[suggested-message]",
        JSON.stringify(suggestedMessageLogFields(result, Date.now() - t0, provider, reason)),
      );

      res.json({ subject: result.subject, message: result.message, source: result.source });
    } catch (err) {
      console.error("[suggested-message] DB error:", err instanceof Error ? err.message : String(err));
      res.status(500).json({ error: "Failed to draft a message" });
    }
  },
);

export default router;
