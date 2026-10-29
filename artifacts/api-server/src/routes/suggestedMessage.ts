import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { pool, toDateStr } from "../db";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import {
  activeMessageProvider,
  isSuggestedMessageAiEnabled,
  suggestMessage,
  suggestedMessageLogFields,
  type MessageChannel,
} from "../lib/suggestedMessage";

const router = Router();

// Auth-gated AND rate-limited so Regenerate can't turn this into an open LLM
// proxy.
const suggestedMessageLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

function asChannel(v: unknown): MessageChannel | null {
  return v === "text" || v === "email" || v === "linkedin" ? v : null;
}

// POST /api/contacts/:id/suggested-message  { channel?, headline? }
// Always answers with a draft: the AI one when configured and valid, else the
// deterministic template. Never sends anything — the client shows the draft
// for the user to edit and send themselves.
router.post(
  "/contacts/:id/suggested-message",
  requireAuth,
  suggestedMessageLimiter,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).userId;
    const { id } = req.params;
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

      const channel = asChannel(req.body?.channel) ?? asChannel(contact.preferred_contact_method) ?? "text";
      const provider = isSuggestedMessageAiEnabled() ? activeMessageProvider() : null;
      const t0 = Date.now();
      const result = await suggestMessage({
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
        channel,
      });

      // METADATA ONLY — never the notes, the prompt, or the drafted message.
      console.log(
        "[suggested-message]",
        JSON.stringify(suggestedMessageLogFields(result, channel, Date.now() - t0, provider)),
      );

      res.json({ message: result.message, source: result.source, channel });
    } catch (err) {
      console.error("[suggested-message] DB error:", err instanceof Error ? err.message : String(err));
      res.status(500).json({ error: "Failed to draft a message" });
    }
  },
);

export default router;
