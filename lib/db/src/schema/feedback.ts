import { pgTable, text, uuid, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// In-app feedback / bug reports / feature requests submitted by signed-in
// users. Rows are written by the API server (artifacts/api-server/src/routes/feedback.ts)
// using the authenticated Clerk userId — never a client-supplied value.
export const feedbackTable = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Clerk user id of the submitter. Not a foreign key (Clerk owns the user
  // record, not our database) — same convention as contacts.user_id /
  // user_settings.user_id elsewhere in this schema.
  userId: text("user_id").notNull(),
  // "bug" | "feature" | "general" — kept as free text (not a Postgres enum)
  // to match the rest of this codebase's convention of plain text columns
  // with application-level validation (see contacts.importance, .status
  // below) rather than DB-level enums, so adding a new type never requires
  // a migration.
  type: text("type").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  // Optional — user-provided contact email, prefilled from Clerk but
  // editable. Never trust this for authentication/authorization.
  contactEmail: text("contact_email"),
  mayContact: boolean("may_contact").notNull().default(false),
  // Auto-captured diagnostic context for bug reports (also stored for the
  // other types, harmless either way). No secrets/tokens/cookies — only the
  // current route, browser UA string, and app version.
  pageUrl: text("page_url"),
  userAgent: text("user_agent"),
  appVersion: text("app_version"),
  // "new" | "reviewing" | "resolved" | "closed"
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFeedbackSchema = createInsertSchema(feedbackTable).omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
// NOTE: intentionally NOT `z.infer<typeof insertFeedbackSchema>` here.
// drizzle-zod@0.8.x's createInsertSchema targets the Zod v4 API, while this
// workspace's pinned `zod` catalog version is v3.25.x (see pnpm-workspace.yaml).
// The resulting ZodObject shape doesn't satisfy Zod v3's `ZodType<any,any,any>`
// constraint, which breaks `tsc` even though nothing at runtime is affected
// (insertFeedbackSchema itself still works fine as a runtime validator).
// Deriving the insert type straight from the Drizzle table — the same
// approach already used for `Feedback` below — sidesteps the cross-version
// generic mismatch entirely.
export type InsertFeedback = typeof feedbackTable.$inferInsert;
export type Feedback = typeof feedbackTable.$inferSelect;
