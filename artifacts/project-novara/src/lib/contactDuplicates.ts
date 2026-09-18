// ============================================================================
// "Do I already have this person?"
//
// Added for the native Contacts import: picking someone out of an address book
// is so easy that importing the same person twice becomes easy too, in a way
// that typing a card out by hand never was. POST /api/contacts happily creates
// a second row — it has no uniqueness rule — so the check has to happen before
// the save, while the user can still act on it.
//
// Pure and dependency-free, so the matching rules are unit-testable.
//
// Deliberately CONSERVATIVE. A false positive tells someone they already know a
// person they don't, which is worse than letting a genuine duplicate through:
// the result is a warning with a link to the existing contact, never a block.
// ============================================================================
import type { Contact } from "@/types/contact";

/** The subset of a contact that a scan or an address-book entry provides. */
export interface DuplicateCandidate {
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phone?: string;
}

function normaliseText(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

/** Emails match case-insensitively; everything else about them is left alone. */
function normaliseEmail(value: string | undefined | null): string {
  return normaliseText(value);
}

/**
 * Phone numbers are compared on digits only, and only on the last 7 of them.
 *
 * The same person's number is stored as "+1 (415) 555-0133" in one place and
 * "4155550133" in another, and a card may omit the country code entirely.
 * Seven digits is short enough to survive those differences and long enough
 * that a collision between two real contacts is vanishingly unlikely.
 */
function normalisePhone(value: string | undefined | null): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-7) : "";
}

/**
 * Finds an existing contact that is very likely the same person.
 *
 * In priority order:
 *   1. the same email address
 *   2. the same phone number
 *   3. the same full name AND the same company
 *
 * Name alone is not enough — two people called James Smith are ordinary, and
 * flagging them would make the warning noise rather than signal.
 */
export function findDuplicateContact(
  contacts: readonly Contact[],
  candidate: DuplicateCandidate,
): Contact | null {
  const email = normaliseEmail(candidate.email);
  if (email) {
    const match = contacts.find((c) => normaliseEmail(c.email) === email);
    if (match) return match;
  }

  const phone = normalisePhone(candidate.phone);
  if (phone) {
    const match = contacts.find((c) => normalisePhone(c.phone) === phone);
    if (match) return match;
  }

  const first = normaliseText(candidate.firstName);
  const last = normaliseText(candidate.lastName);
  const company = normaliseText(candidate.company);
  if (first && last && company) {
    const match = contacts.find(
      (c) =>
        normaliseText(c.firstName) === first &&
        normaliseText(c.lastName) === last &&
        normaliseText(c.company) === company,
    );
    if (match) return match;
  }

  return null;
}
