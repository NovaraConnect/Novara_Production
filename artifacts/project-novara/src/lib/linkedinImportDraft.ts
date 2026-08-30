// ============================================================================
// Applying a LinkedIn screenshot import to the Add Contact form.
//
// Importing a second screenshot has to behave like a fresh draft: whatever the
// previous import wrote must not survive into the new one. Without this, a
// field the new screenshot has no value for silently keeps the old person's
// data — e.g. Company still reading the previous profile's employer, which is
// the kind of wrong value a user is least likely to notice before saving.
//
// It only clears what the previous import itself wrote AND the user hasn't
// touched since, so anything typed by hand survives. Pure and synchronous so
// the rule is unit-testable without rendering the form.
// ============================================================================
import type { LinkedInDraft } from "@/lib/linkedinParse";

/** The form fields a LinkedIn import is allowed to own. Deliberately excludes
 *  email and phone — a LinkedIn screenshot never fills those. */
export const LINKEDIN_IMPORT_FIELDS = [
  "firstName",
  "lastName",
  "role",
  "company",
  "linkedinUrl",
] as const;

export type LinkedInImportField = (typeof LINKEDIN_IMPORT_FIELDS)[number];

export type FormSnapshot = Record<LinkedInImportField, string> & { notes: string };

/** What a previous import wrote, so it can be identified and withdrawn. */
export type AppliedImport = Partial<Record<LinkedInImportField, string>> & { notes?: string };

export interface ImportPlan {
  /** Field -> value to write. A field set to "" is being cleared. */
  updates: Partial<FormSnapshot>;
  /** What this import owns, to hand back on the next import. */
  applied: AppliedImport;
}

/**
 * Works out the writes for a new import, given the current form contents and
 * what the previous import wrote.
 *
 * - A field the previous import wrote and the user hasn't edited is cleared,
 *   then re-filled if the new draft has a value for it.
 * - A field the user typed themselves is left alone unless the new draft
 *   actually has a value for it.
 * - The previous provenance/location note is removed before the new one is
 *   appended, so notes don't accumulate stale locations.
 */
export function planLinkedInImport(
  current: FormSnapshot,
  previous: AppliedImport,
  incoming: LinkedInDraft,
): ImportPlan {
  const updates: Partial<FormSnapshot> = {};
  const applied: AppliedImport = {};

  for (const field of LINKEDIN_IMPORT_FIELDS) {
    const incomingValue = (incoming[field] ?? "").trim();
    const previousValue = previous[field];
    const userEdited = previousValue !== undefined && current[field] !== previousValue;

    if (incomingValue) {
      updates[field] = incomingValue;
      applied[field] = incomingValue;
    } else if (previousValue !== undefined && !userEdited) {
      // Ours, untouched, and the new screenshot has nothing for it → clear it
      // rather than leave the previous profile's value behind.
      updates[field] = "";
    }
    // else: user's own text, or never ours — leave it.
  }

  let notes = current.notes ?? "";
  if (previous.notes && notes.includes(previous.notes)) {
    notes = notes.replace(previous.notes, "").replace(/\n{3,}/g, "\n\n").trim();
  }
  const incomingNotes = (incoming.notes ?? "").trim();
  if (incomingNotes) {
    notes = notes.trim() ? `${notes.trim()}\n${incomingNotes}` : incomingNotes;
    applied.notes = incomingNotes;
  }
  if (notes !== (current.notes ?? "")) updates.notes = notes;

  return { updates, applied };
}
