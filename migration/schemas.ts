import { z } from "zod";

// ── Contact form schema (Add + Edit) ─────────────────────────────────────────

export const contactFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  company: z.string().min(1, "Company is required"),
  role: z.string().optional(),
  metAt: z.string().optional(),
  linkedinUrl: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional(),
  industry: z.string().optional(),
  function: z.string().optional(),
  importance: z.enum(["High", "Medium", "Low"]),
  connectionStatus: z.enum(["connected", "pipeline"]),
  initialFollowUpDays: z.coerce
    .number()
    .refine((val) => [1, 2, 3, 5, 7, 14].includes(val), {
      message: "Must be 1, 2, 3, 5, 7, or 14",
    }),
  followUpCadenceDays: z.coerce
    .number()
    .refine((val) => [14, 30, 60, 90].includes(val), {
      message: "Must be 14, 30, 60, or 90",
    }),
  notes: z.string().optional(),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

// ── Settings schemas ──────────────────────────────────────────────────────────

export const careerStatementSchema = z.object({
  careerStatement: z.string().max(500, "Keep it under 500 characters"),
  goalTags: z.array(z.string()),
});

export const autoDowngradeSchema = z.object({
  autoDowngradeAfterMonths: z.union([
    z.literal(3),
    z.literal(6),
    z.literal(9),
    z.literal(12),
  ]),
});

// ── LinkedIn URL schema ───────────────────────────────────────────────────────

export const linkedInUrlSchema = z.object({
  url: z
    .string()
    .url("Must be a valid URL")
    .includes("linkedin.com", { message: "Must be a LinkedIn URL" }),
});
