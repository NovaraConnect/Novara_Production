// ============================================================================
// Reporting an AI-suggested message.
//
// Google Play's policy on AI-generated content asks apps that generate content
// to let people report offensive output from inside the app. A report goes
// through the existing feedback endpoint, so it lands where every other piece
// of feedback does, with the exact AI text attached for review. Only the draft
// the AI wrote is sent, never the user's edits or the contact's details.
// ============================================================================
import type { FeedbackSubmission } from "./api";
import { APP_VERSION } from "./appVersion";

export const DRAFT_REPORT_SUBJECT = "Reported AI-suggested message";

/** Room left in the feedback description after the explanation line. */
const MAX_REPORTED_TEXT = 4500;

export function draftReport(aiDraft: string, pageUrl?: string): FeedbackSubmission {
  return {
    type: "general",
    subject: DRAFT_REPORT_SUBJECT,
    description:
      "Someone reported this AI-suggested message as offensive, harmful or wrong.\n\n" +
      aiDraft.slice(0, MAX_REPORTED_TEXT),
    mayContact: false,
    pageUrl,
    appVersion: APP_VERSION,
  };
}
