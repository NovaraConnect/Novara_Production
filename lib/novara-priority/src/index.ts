// ============================================================================
// @workspace/novara-priority — THE single source of truth for Novara's
// AI Suggested Priority and AI Suggested Cadence.
//
// Every workflow (backend contact create/edit/import/demo, career-goal
// recalculation, and the frontend Add/Edit/Detail/Dashboard/List/Scheduler
// previews) imports these functions. There must be NO second implementation
// of priority or cadence anywhere in the codebase.
//
// ── Priority model (deterministic, three-tier) ──────────────────────────────
// The suggestion is computed purely from structured alignment between the
// user's professional profile and the contact. Base Priority is intentionally
// NOT an input here — it never determines the suggested band (it lives on the
// contact only as a user-editable field and, conceptually, as the fallback the
// effective priority resolves to when no AI signal exists → "Medium").
//
// We derive four independent boolean alignment signals from the contact:
//   • companyMatch  — contact company        ↔ profile
//   • roleMatch     — role / title / function / seniority ↔ profile
//   • industryMatch — contact industry       ↔ profile
//   • contextMatch  — interests / tags / notes / relationship context ↔ profile
//
// companyMatch and industryMatch are treated as equally-valid "specificity"
// signals — a contact can be relevant either because they're at a company
// you named, or because they're in an industry you named.
//
// Banding (updated 2026-08-12 — added an independent recruiter path to High;
// previously updated 2026-08-11 so industry-only alignment could reach High
// alongside a role match, not just company-only):
// • High = roleMatch AND (companyMatch OR industryMatch)
//   (the kind of work you want, at either a named company or in a named
//   industry — e.g. Sales at Estée Lauder for "Sales"+"Estée Lauder",
//   or Sales in the beauty industry for "Sales"+"Beauty")
//   OR a recruiter whose industry matches a target industry — a recruiter
//   is the gatekeeper to that industry, not the job itself, so their own
//   title never has to match your target role.
// • Medium = any single signal alone (role only, company only, industry
//   only, or context only), but not the High combo
// • Low = no alignment signal at all
//
// This is why role-only, company-only, or industry-only alignment lands in
// Medium and cannot be inflated to High on its own — High requires the role
// signal plus at least one specificity signal together (or the recruiter
// exception above) — and why an unrelated contact (Tesla PM, an
// investment-banking analyst) stays Low.

// ── Cadence model ───────────────────────────────────────────────────────────
// Cadence is NEVER independently generated. It is always derived from the
// effective priority via SUGGESTED_CADENCE_DAYS unless the user has manually
// overridden it.
// ============================================================================

export const PRIORITY_LEVELS = ["High", "Medium", "Low"] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

/** Canonical automatic-cadence mapping. High → 3wk, Medium → 6wk, Low → 3mo. */
export const SUGGESTED_CADENCE_DAYS = {
  High: 21,
  Medium: 42,
  Low: 90,
} as const satisfies Record<PriorityLevel, number>;

/** The manual cadence choices offered wherever cadence can be edited.
 *  3 weeks / 1 month / 6 weeks / 2 months / 3 months / 6 months. */
export const MANUAL_CADENCE_OPTIONS = [21, 30, 42, 60, 90, 180] as const;
export type ManualCadenceDays = (typeof MANUAL_CADENCE_OPTIONS)[number];

const STOP_WORDS = new Set([
  "a", "an", "the", "at", "in", "to", "be", "is", "are", "and", "or", "for", "of",
  "my", "i", "want", "aspire", "looking", "seeking", "become", "get", "into", "as", "would",
  "like", "role", "position", "job", "work", "with", "from", "on", "about", "that", "this",
  "have", "will", "not", "but", "been", "was", "were", "their", "they", "some", "more", "than",
]);

// ── Normalization ────────────────────────────────────────────────────────────
// Identical normalization is applied to BOTH profile and contact data so that
// accented and punctuated values fold together. Required example:
//   "Estée Lauder" → "estee lauder"
export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")                 // decompose: é → e + combining accent
    .replace(/[̀-ͯ]/g, "")  // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")     // normalize punctuation to spaces
    .replace(/\s+/g, " ")             // collapse whitespace
    .trim();
}

/** Meaningful tokens (≥3 chars, non-stop-word), deduped implicitly by callers. */
export function tokenize(value: unknown): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

/** Normalize any input (string | string[] | null) into a list of non-empty
 *  normalized values, preserving useful multi-word values. */
function toValues(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [input];
  return raw.map(normalizeText).filter(Boolean);
}

export interface UserProfessionalProfile {
  careerGoals?: string[] | null;
  careerStatement?: string | null;
  targetRoles?: string[] | null;
  targetIndustries?: string[] | null;
  targetCompanies?: string[] | null;
  goalTags?: string[] | null;
}

export interface PriorityContact {
  company?: string | null;
  role?: string | null;
  jobTitle?: string | null;
  industry?: string | null;
  seniority?: string | null;
  function?: string | null;
  tags?: string[] | null;
  goalTags?: string[] | null;
  interests?: string[] | null;
  notes?: string | null;
  relationshipContext?: string | null;
  metAt?: string | null;
}

/** Coerce any stored/legacy value into exactly one of High | Medium | Low. */
export function normalizePriority(value: unknown, fallback: PriorityLevel = "Medium"): PriorityLevel {
  const n = normalizeText(value);
  if (n === "high") return "High";
  if (n === "low") return "Low";
  if (n === "medium") return "Medium";
  return fallback;
}

// A built profile: the flat set of tokens + the multi-word phrases, used to
// test every contact field against the whole professional profile.
interface BuiltProfile {
  tokens: Set<string>;
  phrases: string[]; // multi-word normalized phrases only (e.g. "estee lauder")
}

function buildProfile(profile: UserProfessionalProfile): BuiltProfile {
  const values = [
    ...toValues(profile.careerGoals),
    ...toValues(profile.careerStatement),
    ...toValues(profile.targetRoles),
    ...toValues(profile.targetIndustries),
    ...toValues(profile.targetCompanies),
    ...toValues(profile.goalTags),
  ];
  const tokens = new Set<string>();
  const phrases: string[] = [];
  for (const v of values) {
    for (const t of tokenize(v)) tokens.add(t);
    if (v.includes(" ")) phrases.push(v);
  }
  return { tokens, phrases };
}

/** Does a single contact field share any token, or contain any multi-word
 *  profile phrase (in either direction)? */
function fieldMatches(field: unknown, profile: BuiltProfile): boolean {
  const norm = normalizeText(field);
  if (!norm) return false;
  const fieldTokens = tokenize(norm);
  if (fieldTokens.some((t) => profile.tokens.has(t))) return true;
  for (const phrase of profile.phrases) {
    if (norm.includes(phrase) || phrase.includes(norm)) return true;
  }
  return false;
}

function anyFieldMatches(fields: unknown[], profile: BuiltProfile): boolean {
  return fields.some((f) => fieldMatches(f, profile));
}

// ── Recruiter exception ──────────────────────────────────────────────────────
// A recruiter's own title (e.g. "Technical Recruiter") will almost never
// match your target role — that's expected, they're not doing the job you
// want, they're hiring for it. Within a target industry, a recruiter is
// still one of the most valuable contacts you can have, so they get an
// independent path to High that doesn't require roleMatch.
const RECRUITER_PATTERN = /\brecruit(er|ing)?\b|\btalent acquisition\b/;

function isRecruiterRole(contact: PriorityContact): boolean {
  const norm = normalizeText(
    [contact.role, contact.jobTitle, contact.function].filter(Boolean).join(" "),
  );
  return RECRUITER_PATTERN.test(norm);
}

/**
 * THE canonical AI suggested-priority calculation used by every workflow.
 * Deterministic and side-effect free. Always returns exactly High | Medium | Low.
 */
export function computeSuggestedPriority(
  contact: PriorityContact,
  profile: UserProfessionalProfile,
): PriorityLevel {
  const built = buildProfile(profile);
  // No profile signal at all → we cannot meaningfully rank → neutral Medium.
  if (built.tokens.size === 0 && built.phrases.length === 0) return "Medium";

  const companyMatch = fieldMatches(contact.company, built);
  const roleMatch = anyFieldMatches(
    [contact.role, contact.jobTitle, contact.function, contact.seniority],
    built,
  );
  const industryMatch = fieldMatches(contact.industry, built);
  const contextMatch = anyFieldMatches(
    [
      contact.interests,
      contact.tags,
      contact.goalTags,
      contact.notes,
      contact.relationshipContext,
      contact.metAt,
    ],
    built,
  );

  // High: the specific target role at a target-relevant company.
  const specificityMatch = companyMatch || industryMatch;
  // High: a recruiter operating inside a target industry — the gatekeeper to
  // that industry, not the job itself, so roleMatch doesn't apply to them.
  const recruiterInTargetIndustry = isRecruiterRole(contact) && industryMatch;

  // High: the kind of work you want, at a relevant company or industry —
  // or the recruiter exception above.
  if ((roleMatch && specificityMatch) || recruiterInTargetIndustry) return "High";
  // Medium: any single meaningful alignment signal.
  if (roleMatch || specificityMatch || contextMatch) return "Medium";
  // Low: nothing aligns.
  return "Low";
}

/** Cadence is derived ONLY from the (effective) priority. Never AI-generated. */
export function deriveSuggestedCadence(priority: PriorityLevel): 21 | 42 | 90 {
  return SUGGESTED_CADENCE_DAYS[normalizePriority(priority)];
}

/** effectivePriority = manualPriorityOverride ?? aiSuggestedPriority */
export function getEffectivePriority(
  aiSuggestedPriority: PriorityLevel,
  manualPriorityOverride?: PriorityLevel | null,
): PriorityLevel {
  return manualPriorityOverride == null
    ? normalizePriority(aiSuggestedPriority)
    : normalizePriority(manualPriorityOverride);
}

/** effectiveCadence = manualCadenceOverride ?? aiSuggestedCadence */
export function getEffectiveCadence(
  aiSuggestedCadence: number,
  manualCadenceOverride?: number | null,
): number {
  return manualCadenceOverride == null ? aiSuggestedCadence : manualCadenceOverride;
}

/** Human label for a cadence value in days. */
export function cadenceLabel(days: number): string {
  const labels: Record<number, string> = {
    21: "Every 3 weeks",
    30: "Every month",
    42: "Every 6 weeks",
    60: "Every 2 months",
    90: "Every 3 months",
    180: "Every 6 months",
  };
  return labels[days] ?? `Every ${days} days`;
}
