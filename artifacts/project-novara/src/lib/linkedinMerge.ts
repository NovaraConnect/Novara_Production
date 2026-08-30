// ============================================================================
// Merge the AI LinkedIn-parse result over the deterministic parse (draft A).
// Failure-safe: if there is no AI result or its confidence is "low", the
// deterministic draft is used unchanged. The AI-provided profile URL is
// RE-VALIDATED before use so the model can't inject a fabricated or
// off-platform link.
//
// Email and phone are absent from this path BY CONSTRUCTION: LinkedInDraft has
// no such fields and the AI contract doesn't include them, so there is nothing
// to merge and nothing that can leak into the contact form from a screenshot.
// ============================================================================
import type { LinkedInDraft } from "@/lib/linkedinParse";

export interface AiLinkedInFields {
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  company: string | null;
  location: string | null;
  linkedinUrl: string | null;
}

export interface AiLinkedInResult {
  fields: AiLinkedInFields;
  confidence: "high" | "medium" | "low";
}

const PROVENANCE_LINE = "Imported from LinkedIn screenshot";

/**
 * Returns a normalized https://linkedin.com/in/... profile URL, or null when
 * the value isn't one. Anything off-platform, any non-profile LinkedIn path,
 * and any unparseable string is rejected rather than passed through.
 */
export function normalizeLinkedInProfileUrl(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  // Accept linkedin.com and its country subdomains (uk.linkedin.com, …).
  const isLinkedIn = host === "linkedin.com" || host.endsWith(".linkedin.com");
  if (!isLinkedIn) return null;
  if (!/^\/in\/[^/]+/i.test(u.pathname)) return null;
  u.protocol = "https:";
  u.search = "";
  u.hash = "";
  let normalized = u.toString();
  if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized;
}

/** Upserts the "Location: …" line in the provenance notes, leaving any other
 *  note content the user may already have alone. */
function withLocationNote(notes: string | undefined, location: string): string {
  const base = notes?.trim() ? notes : PROVENANCE_LINE;
  const lines = base.split("\n");
  const idx = lines.findIndex((l) => /^location:/i.test(l.trim()));
  const line = `Location: ${location}`;
  if (idx >= 0) lines[idx] = line;
  else lines.push(line);
  return lines.join("\n");
}

/**
 * Prefer AI text fields (name/role/company) when confidence is medium/high,
 * filling any AI gaps from the deterministic draft. The profile URL is only
 * taken from the AI when it re-validates as a real LinkedIn profile URL;
 * otherwise the deterministic value is kept. Location is recorded in the notes
 * (the contact model has no location column — no schema change).
 */
export function mergeLinkedInResult(
  deterministic: LinkedInDraft,
  ai: AiLinkedInResult | null,
): LinkedInDraft {
  if (!ai || ai.confidence === "low") return deterministic;

  const f = ai.fields;
  const merged: LinkedInDraft = { ...deterministic };

  const setIfPresent = (key: "firstName" | "lastName" | "role" | "company", v: string | null) => {
    const t = (v ?? "").trim();
    if (t) merged[key] = t;
  };
  setIfPresent("firstName", f.firstName);
  setIfPresent("lastName", f.lastName);
  setIfPresent("role", f.role);
  setIfPresent("company", f.company);

  if (f.linkedinUrl) {
    const url = normalizeLinkedInProfileUrl(f.linkedinUrl);
    if (url) merged.linkedinUrl = url;
  }

  const location = (f.location ?? "").trim();
  if (location) merged.notes = withLocationNote(merged.notes, location);

  return merged;
}
