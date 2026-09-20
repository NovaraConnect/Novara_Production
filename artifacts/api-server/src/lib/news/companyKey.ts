// ============================================================================
// Turning a company name into a cache key.
//
// News about Revolut is news about Revolut. Two users who both know someone
// there should share one lookup, whether they typed "Revolut", "revolut" or
// "Revolut Ltd". This module decides when two spellings are the same company.
//
// DELIBERATELY CONSERVATIVE, because the two failure modes are not equally
// bad. Failing to merge two spellings costs one extra provider request —
// cents, and invisible. Merging two DIFFERENT companies shows a user news
// about someone else's employer, which is a visible, confusing bug and, for a
// relationship tool, a credibility problem. So every rule below is one where
// a false merge is implausible, and anything cleverer is left undone.
//
// Specifically NOT done, on purpose:
//   • no stripping of a leading "The" — "The Guardian" and "Guardian Media"
//     are not reliably the same thing, and the saving is one request
//   • no stemming, no fuzzy/edit-distance matching, no token subset matching:
//     "Delta" must never collide with "Delta Air Lines"
//   • no acronym expansion — "GM" is not "General Motors" for our purposes
// ============================================================================

/**
 * Trailing legal-form suffixes. Removed only as the LAST token, so "Inc" in
 * "Inc Magazine" survives. Each is a legal form rather than a brand, which is
 * what makes dropping it safe: "Apple" and "Apple Inc" are one company.
 */
const LEGAL_SUFFIXES = new Set([
  "inc", "incorporated", "corp", "corporation", "co", "company",
  "llc", "llp", "lp", "ltd", "limited", "plc",
  "gmbh", "ag", "kg", "mbh",
  "nv", "bv", "sa", "sas", "sarl", "srl", "spa", "ab", "as", "oy", "oyj",
  "pty", "pte", "kk", "kft", "zrt", "doo", "aps",
]);

/** The longest company name we will key on. Beyond this something has gone
 *  wrong upstream and we do not want it as a primary key. */
const MAX_KEY_LENGTH = 120;

/**
 * Normalises a company name to a stable cache key.
 *
 * Returns an empty string when there is nothing usable left, which callers
 * MUST treat as "do not cache, do not look up" rather than as a key.
 */
export function companyCacheKey(raw: string): string {
  if (!raw) return "";

  let s = raw
    // Decompose accents then drop the combining marks, so "L'Oréal" and
    // "L'Oreal" agree. This is a spelling difference, never two companies.
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Apostrophes vanish rather than becoming spaces: "l'oreal" -> "loreal",
    // matching how people type it when they leave the mark out.
    .replace(/['‘’ʼ]/g, "")
    // "&" and "and" are written interchangeably in company names.
    .replace(/&/g, " and ")
    // Periods are removed rather than split on, so dotted legal forms survive
    // as one token: "Nestle S.A." -> "nestle sa", which the suffix list can
    // then recognise. Splitting would leave "s" and "a" and match neither.
    .replace(/\./g, "")
    // Everything else non-alphanumeric is a separator.
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  if (!s) return "";

  // Drop ONE trailing legal form. Only one: "Foo Holdings Ltd Inc" is not a
  // real pattern, and repeated stripping is how over-eager normalisers start
  // merging unrelated names.
  const tokens = s.split(" ");
  if (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (last && LEGAL_SUFFIXES.has(last)) tokens.pop();
  }
  s = tokens.join(" ");

  // A one-or-two character remainder is too weak to be a shared cache key —
  // far too easy for unrelated companies to collide on. Fall back to the
  // un-stripped form rather than risk it.
  if (s.length < 3) {
    const fallback = raw
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    return fallback.slice(0, MAX_KEY_LENGTH);
  }

  return s.slice(0, MAX_KEY_LENGTH);
}

/**
 * The name to show and to send to the provider. Whitespace-tidied only —
 * the provider searches better with the real name than the flattened key.
 */
export function displayCompanyName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_KEY_LENGTH);
}
