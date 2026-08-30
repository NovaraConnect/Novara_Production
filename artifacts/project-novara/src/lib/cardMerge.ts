// ============================================================================
// Merge the AI card-parse result over the deterministic parse (draft A).
// Failure-safe: if there is no AI result or its confidence is "low", the
// deterministic draft is used unchanged. AI-provided email/phone/website are
// RE-VALIDATED before use so the model can't inject a fabricated contact.
// ============================================================================
import { cleanRole, type ScannedContact } from "@/lib/businessCardParse";

export interface AiCardFields {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
}

export interface AiCardResult {
  fields: AiCardFields;
  confidence: "high" | "medium" | "low";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

export function isValidPhone(s: string): boolean {
  const digits = s.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/** Returns a normalized https URL, or null if not a plausible website. */
export function normalizeWebsite(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    return withScheme;
  } catch {
    return null;
  }
}

/**
 * Prefer AI text fields (name/company/role) when confidence is medium/high,
 * filling any AI gaps from the deterministic draft. Contact fields
 * (email/phone/website) are only taken from the AI when they re-validate;
 * otherwise the deterministic value is kept.
 */
export function mergeCardResult(deterministic: ScannedContact, ai: AiCardResult | null): ScannedContact {
  if (!ai || ai.confidence === "low") return deterministic;

  const f = ai.fields;
  const merged: ScannedContact = { ...deterministic };

  const setIfPresent = (key: "firstName" | "lastName" | "company" | "role", v: string | null) => {
    const t = (v ?? "").trim();
    if (t) merged[key] = t;
  };
  setIfPresent("firstName", f.firstName);
  setIfPresent("lastName", f.lastName);
  setIfPresent("company", f.company);

  // De-noise the AI role through the deterministic cleaner: it drops brand /
  // company / adjacent noise words glued to the title ("Carrs Manager" ->
  // "Manager") while keeping real multi-word titles ("Marketing Manager").
  // When the cleaner finds no known role keyword (e.g. "Barista"), keep the
  // AI's raw role rather than dropping a legitimate title.
  const aiRole = (f.role ?? "").trim();
  if (aiRole) merged.role = cleanRole(aiRole) ?? aiRole;

  if (f.email && isValidEmail(f.email)) merged.email = f.email.trim().toLowerCase();
  if (f.phone && isValidPhone(f.phone)) merged.phone = f.phone.trim();
  if (f.website) {
    const w = normalizeWebsite(f.website);
    if (w) merged.website = w;
  }

  return merged;
}
