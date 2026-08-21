import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";
import { sendFeedbackNotification } from "../lib/email";

const router = Router();

const FEEDBACK_TYPES = new Set(["bug", "feature", "general"]);
const MAX_SUBJECT_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_CONTACT_EMAIL_LENGTH = 320;
const MAX_PAGE_URL_LENGTH = 500;
const MAX_USER_AGENT_LENGTH = 500;
const MAX_APP_VERSION_LENGTH = 50;

// Deliberately simple; this is a UX sanity check on the optional contact
// email field, not a security boundary. Never used to authenticate.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Dedicated, stricter rate limit for feedback submissions on top of the
// global /api limiter in app.ts. Keyed by the authenticated Clerk userId
// (never by IP alone) so it can't be dodged by rotating networks and won't
// penalize other users sharing a NAT/proxy. requireAuth runs first so
// userId is always populated by the time this limiter's keyGenerator reads it.
export const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (req as AuthedRequest).userId ?? req.ip ?? "unknown",
  message: { error: "Too many feedback submissions. Please try again later." },
});

function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

// POST /api/feedback
router.post("/feedback", requireAuth, feedbackLimiter, async (req: Request, res: Response) => {
  // userId always comes from the verified Clerk session (set by requireAuth),
  // never from the request body -- a client-supplied userId is ignored even
  // if present.
  const userId = (req as AuthedRequest).userId;
  const { type, subject, description, contactEmail, mayContact, pageUrl, userAgent, appVersion } =
    (req.body ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(type) || !FEEDBACK_TYPES.has(type)) {
    res.status(400).json({ error: "type must be one of: bug, feature, general" });
    return;
  }
  if (!isNonEmptyString(subject) || subject.length > MAX_SUBJECT_LENGTH) {
    res.status(400).json({ error: `subject is required (max ${MAX_SUBJECT_LENGTH} characters)` });
    return;
  }
  if (!isNonEmptyString(description) || description.length > MAX_DESCRIPTION_LENGTH) {
    res.status(400).json({ error: `description is required (max ${MAX_DESCRIPTION_LENGTH} characters)` });
    return;
  }
  if (contactEmail !== undefined && contactEmail !== null && contactEmail !== "") {
    if (
      typeof contactEmail !== "string" ||
      contactEmail.length > MAX_CONTACT_EMAIL_LENGTH ||
      !EMAIL_RE.test(contactEmail)
    ) {
      res.status(400).json({ error: "contactEmail must be a valid email address" });
      return;
    }
  }
  if (mayContact !== undefined && typeof mayContact !== "boolean") {
    res.status(400).json({ error: "mayContact must be a boolean" });
    return;
  }
  if (
    pageUrl !== undefined &&
    pageUrl !== null &&
    (typeof pageUrl !== "string" || pageUrl.length > MAX_PAGE_URL_LENGTH)
  ) {
    res.status(400).json({ error: "pageUrl is invalid" });
    return;
  }
  if (
    userAgent !== undefined &&
    userAgent !== null &&
    (typeof userAgent !== "string" || userAgent.length > MAX_USER_AGENT_LENGTH)
  ) {
    res.status(400).json({ error: "userAgent is invalid" });
    return;
  }
  if (
    appVersion !== undefined &&
    appVersion !== null &&
    (typeof appVersion !== "string" || appVersion.length > MAX_APP_VERSION_LENGTH)
  ) {
    res.status(400).json({ error: "appVersion is invalid" });
    return;
  }

  const trimmedSubject = (subject as string).trim();
  const trimmedDescription = (description as string).trim();
  const finalContactEmail = (contactEmail as string | undefined) || null;
  const finalMayContact = Boolean(mayContact);
  const finalPageUrl = (pageUrl as string | undefined) || null;
  const finalUserAgent = (userAgent as string | undefined) || null;
  const finalAppVersion = (appVersion as string | undefined) || null;

  try {
    const {
      rows: [feedback],
    } = await pool.query(
      `INSERT INTO feedback (
        user_id, type, subject, description, contact_email, may_contact,
        page_url, user_agent, app_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, type, subject, status, created_at`,
      [
        userId,
        type,
        trimmedSubject,
        trimmedDescription,
        finalContactEmail,
        finalMayContact,
        finalPageUrl,
        finalUserAgent,
        finalAppVersion,
      ],
    );

    res.status(201).json({
      id: feedback.id,
      type: feedback.type,
      subject: feedback.subject,
      status: feedback.status,
      createdAt: feedback.created_at,
    });

    // The DB row above is already committed and the response already sent --
    // everything past this point is best-effort. A failure here must never
    // cause the submission itself to be lost or reported as failed to the user.
    sendFeedbackNotification({
      id: feedback.id,
      userId,
      type,
      subject: trimmedSubject,
      description: trimmedDescription,
      contactEmail: finalContactEmail,
      mayContact: finalMayContact,
      pageUrl: finalPageUrl,
      userAgent: finalUserAgent,
      appVersion: finalAppVersion,
      createdAt: feedback.created_at,
    }).catch((err) => {
      logger.error({ err, feedbackId: feedback.id }, "Failed to send feedback notification email");
    });
  } catch (err) {
    logger.error({ err, userId }, "Failed to save feedback");
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

export default router;
