import { Resend } from "resend";
import { logger } from "./logger";

const FEEDBACK_TO_EMAIL = process.env.FEEDBACK_TO_EMAIL || "novaraconnect@gmail.com";
// Resend's shared sandbox sender. Deliverable without any domain
// verification, but only to the email address that owns the Resend
// account -- fine as a zero-config default since FEEDBACK_TO_EMAIL is
// expected to be that same inbox. For higher-volume/production-grade
// deliverability, verify a domain in Resend and set RESEND_FROM_EMAIL.
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Novara Feedback <onboarding@resend.dev>";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// The client is created lazily so a missing RESEND_API_KEY doesn't crash the
// server at import time -- it should only degrade the feedback email
// notification. The feedback DB row is always written before this is ever
// called (see routes/feedback.ts), so an email failure never loses data.
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export interface FeedbackNotificationPayload {
  id: string;
  userId: string;
  type: string;
  subject: string;
  description: string;
  contactEmail: string | null;
  mayContact: boolean;
  pageUrl: string | null;
  userAgent: string | null;
  appVersion: string | null;
  createdAt: string | Date;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sends the novaraconnect@gmail.com (or FEEDBACK_TO_EMAIL override) notification
 * for a new feedback submission.
 *
 * Intentionally best-effort: this is called *after* the caller has already
 * responded to the client and committed the DB row. A rejected promise here
 * means "email failed, submission is still safely stored" -- callers must
 * never roll back or re-throw in a way that loses the database record.
 */
export async function sendFeedbackNotification(payload: FeedbackNotificationPayload): Promise<void> {
  if (!resend) {
    logger.warn({ feedbackId: payload.id }, "RESEND_API_KEY not set — skipping feedback email notification");
    return;
  }

  const createdAt =
    typeof payload.createdAt === "string" ? payload.createdAt : payload.createdAt.toISOString();

  const html = `
    <h2>New Novara feedback: ${escapeHtml(payload.type)}</h2>
    <p><strong>Submission ID:</strong> ${escapeHtml(payload.id)}</p>
    <p><strong>Subject:</strong> ${escapeHtml(payload.subject)}</p>
    <p><strong>Description:</strong><br/>${escapeHtml(payload.description).replace(/\n/g, "<br/>")}</p>
    <p><strong>Submitted by (Clerk user ID):</strong> ${escapeHtml(payload.userId)}</p>
    <p><strong>Contact email:</strong> ${payload.contactEmail ? escapeHtml(payload.contactEmail) : "(not provided)"}</p>
    <p><strong>May we contact them?</strong> ${payload.mayContact ? "Yes" : "No"}</p>
    <p><strong>Page:</strong> ${payload.pageUrl ? escapeHtml(payload.pageUrl) : "(not captured)"}</p>
    <p><strong>Browser/device:</strong> ${payload.userAgent ? escapeHtml(payload.userAgent) : "(not captured)"}</p>
    <p><strong>App version:</strong> ${payload.appVersion ? escapeHtml(payload.appVersion) : "(not captured)"}</p>
    <p><strong>Submitted at:</strong> ${escapeHtml(createdAt)}</p>
  `.trim();

  const result = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: FEEDBACK_TO_EMAIL,
    subject: `[Novara ${payload.type}] ${payload.subject} (#${payload.id.slice(0, 8)})`,
    html,
  });

  if (result.error) {
    // resend-node resolves (rather than rejects) with an `error` field on
    // API-level failures -- normalize to a thrown error so callers' .catch()
    // handling works uniformly regardless of failure mode.
    throw new Error(`Resend API error: ${result.error.message}`);
  }
}
