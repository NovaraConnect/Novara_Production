// ============================================================================
// Deterministic parser for OCR text captured from a user-uploaded LinkedIn
// profile screenshot. Pure + synchronous so it is fully unit-testable with
// text fixtures. Best-effort by design — the user reviews and edits every
// field before saving; nothing here saves anything.
//
// Intentionally NEVER extracts email or phone from a LinkedIn screenshot, even
// if the OCR text contains them (a profile rarely shows them, and a wrong pull
// is worse than a blank). Business cards are handled by a different parser.
// ============================================================================

export interface LinkedInDraft {
  firstName?: string;
  lastName?: string;
  role?: string;       // from the headline
  company?: string;
  linkedinUrl?: string; // only when visibly present in the screenshot
  notes?: string;       // provenance line + location, if found
}

// LinkedIn app/web nav & section chrome that OCR commonly captures — skipped so
// it can't be mistaken for a name/headline/company.
const UI_CHROME = new Set([
  "linkedin", "search", "home", "my network", "network", "messages",
  "notifications", "jobs", "me", "work", "post", "following", "follow",
  "followers", "connect", "connected", "message", "more", "pending", "edit",
  "contact info", "activity", "experience", "education", "skills", "about",
  "connections", "mutual connections", "open to", "open to work", "see all",
  "show all", "view profile", "people you may know", "suggested", "highlights",
]);

const ROLE_KEYWORDS =
  /\b(CEO|CFO|CTO|COO|CMO|CRO|VP|SVP|EVP|Founder|Co-?Founder|President|Chairman|Director|Manager|Lead|Head|Principal|Senior|Junior|Engineer|Developer|Designer|Product|Program|Project|Marketing|Sales|Growth|Operations|Partner|Associate|Consultant|Analyst|Officer|Coordinator|Specialist|Strategist|Architect|Scientist|Researcher|Advisor|Recruiter|Talent|Account|Executive)\b/i;

const COMPANY_SUFFIX =
  /\b(Inc\.?|LLC|Ltd\.?|Corp\.?|Co\.?|Group|Solutions|Technolog(?:y|ies)|Systems?|Labs?|Studios?|Agency|Ventures?|Capital|Holdings?|Partners?|Consulting|Media|Bank|Financial|International|Global)\b/;

const LINKEDIN_URL_RE =
  /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/i;

const CONNECTIONS_RE =
  /\b\d[\d,]*\+?\s+(?:connections?|followers?)\b|\bcontact info\b/i;

// A location-ish line: "City, Region[, Country]" or "Greater X …" / "… Area".
const LOCATION_HINT_RE = /,\s*[A-Z][a-z]+|\bGreater\s+[A-Z]|\bArea\b/;

// Action-button rows OCR reads as one line ("Message Connect More"). Matched by
// tokens rather than whole-line equality, because the buttons appear in varying
// combinations — an exact-match list can't cover them and one slipping through
// gets mistaken for the person's name.
const ACTION_WORDS = new Set([
  "message", "connect", "connected", "follow", "following", "more", "share",
  "save", "pending", "withdraw", "accept", "ignore", "view", "profile", "edit",
  "open", "to", "work", "see", "all", "show", "contact", "info",
]);

// Trailing connection-degree badge: "Priya Raman · 2nd".
const DEGREE_BADGE_RE = /\s*[·•|]\s*(?:1st|2nd|3rd)\b.*$/i;
// Pronouns shown next to the name: "Priya Raman (she/her)".
const PRONOUN_RE = /\s*\((?:he|she|they|him|her|them)[^)]*\)/gi;
// "Dr. Priya Raman" / "Prof Priya Raman".
const HONORIFIC_RE = /^(?:dr|mr|mrs|ms|mx|prof|professor)\.?\s+/i;
// "Priya Raman, MBA" / "Priya Raman, PhD".
const CREDENTIAL_SUFFIX_RE =
  /,\s*(?:mba|m\.b\.a\.?|phd|ph\.d\.?|md|jd|cpa|cfa|pmp|rn|esq|pe|ma|msc|bsc|jr|sr|ii|iii|iv)\.?\s*$/i;
// Employment type / date noise glued to a company: "Northwind Labs · Full-time".
const EMPLOYMENT_NOISE_RE =
  /\s*[·•|]\s*(?:full[- ]?time|part[- ]?time|contract|freelance|internship|self[- ]?employed|permanent|seasonal|apprenticeship).*$/i;

/** Strips decorations LinkedIn hangs off the name line so the name itself can be
 *  recognised: degree badge, pronouns, honorific, credential suffix. */
function stripNameDecorations(line: string): string {
  return line
    .replace(DEGREE_BADGE_RE, "")
    .replace(PRONOUN_RE, "")
    // Verification badges / emoji / stray OCR glyphs around the name.
    .replace(/[^\p{L}\p{M}\s.,'’-]/gu, " ")
    .replace(HONORIFIC_RE, "")
    .replace(CREDENTIAL_SUFFIX_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(line: string): string[] {
  return line.toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
}

/** True for a row made up entirely of LinkedIn action/nav words. */
function isActionRow(line: string): boolean {
  const t = tokens(line);
  if (!t.length) return false;
  return t.every((w) => ACTION_WORDS.has(w));
}

function isChrome(lineLower: string): boolean {
  if (UI_CHROME.has(lineLower)) return true;
  if (lineLower.length <= 2) return true; // stray glyphs / nav icons
  if (isActionRow(lineLower)) return true;
  return false;
}

const NAME_STOPWORDS = new Set(["of", "and", "the", "for", "&"]);

/** A company name reads as title case ("Northwind Labs"), not as a sentence
 *  fragment ("Building demand engines"). Requiring title case is what keeps a
 *  wrapped headline line from being taken as the employer. */
function looksLikeCompanyName(s: string): boolean {
  const t = s.trim();
  if (!t || /\d{4}/.test(t) || /@/.test(t)) return false;
  if (LOCATION_HINT_RE.test(t) || CONNECTIONS_RE.test(t)) return false;
  if (ROLE_KEYWORDS.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 4) return false;
  // A company name doesn't begin with a connective — a line starting "for …" or
  // "and …" is a wrapped continuation of the headline, not the employer.
  if (!/^[A-ZÀ-Þ0-9]/.test(words[0])) return false;
  if (COMPANY_SUFFIX.test(t)) return true;
  return words.every((w) => NAME_STOPWORDS.has(w.toLowerCase()) || /^[A-ZÀ-Þ0-9]/.test(w));
}

/** Trims company noise: "Northwind Labs · Full-time" -> "Northwind Labs". */
function cleanCompany(s: string): string {
  return s
    .replace(EMPLOYMENT_NOISE_RE, "")
    .split(/\s*[·•|]\s*/)[0]
    .replace(/,\s*$/, "")
    .trim();
}

const NAME_PARTICLES = new Set(["de", "del", "da", "di", "van", "von", "der", "la", "le", "bin", "al"]);

function titleCaseWord(s: string): string {
  const lower = s.toLowerCase();
  if (NAME_PARTICLES.has(lower)) return lower; // "de la Cruz", not "De La Cruz"
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// 2–4 capitalized words, no digits/@, and not a job-title line. Decorations
// (degree badge, pronouns, honorific, credentials) are stripped first — a real
// screenshot almost always carries at least one of them, and without this the
// name line is rejected and something else (often a button row) is taken as the
// name instead.
function looksLikeName(rawLine: string): boolean {
  const line = stripNameDecorations(rawLine);
  if (!line) return false;
  if (isActionRow(line)) return false;        // "Message Connect More" is not a name
  if (LOCATION_HINT_RE.test(line)) return false; // "Austin, Texas" is not a name
  if (/\d/.test(line) || /@/.test(line)) return false;
  if (ROLE_KEYWORDS.test(line)) return false; // "Product Manager" is not a name
  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false; // "Ana María de la Cruz"
  return words.every((w) =>
    /^[A-ZÀ-Þ][a-zà-ÿ'’]+$/.test(w) ||          // Mixed case incl. accents (José)
    /^[A-ZÀ-Þ][A-ZÀ-Þ.'’-]+$/.test(w) ||        // ALLCAPS
    /^[A-ZÀ-Þ]\.?$/.test(w) ||                  // Middle initial ("K." / "K")
    /^(?:de|del|da|di|van|von|der|la|le|bin|al)$/i.test(w) || // name particles
    /^[A-Z][a-z]+-[A-Z][a-z]+$/.test(w),        // Hyphenated (Mary-Jane)
  );
}

/** Second pass, used only when no line passes the strict test. OCR routinely
 *  mangles capitalisation on the name line ("PRIYA raman", "Priya Ramanm"), and
 *  a blank name cascades — the headline is only searched below the name, so
 *  role and location go missing too. Stays conservative: chrome, action rows,
 *  locations, URLs, connection counts and role-worded lines are still rejected,
 *  and at least one word must look like a capitalised name. */
function looksLikeNameLoose(rawLine: string): boolean {
  const line = stripNameDecorations(rawLine);
  if (!line) return false;
  if (isActionRow(line)) return false;
  if (LOCATION_HINT_RE.test(line)) return false;
  if (CONNECTIONS_RE.test(line) || LINKEDIN_URL_RE.test(line)) return false;
  if (/\d/.test(line) || /@/.test(line)) return false;
  if (ROLE_KEYWORDS.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  if (!words.every((w) => /^[\p{L}\p{M}.'’-]+$/u.test(w))) return false;
  return words.some((w) => /^[A-ZÀ-Þ]/.test(w));
}

export function parseLinkedInProfile(rawText: string): LinkedInDraft {
  const draft: LinkedInDraft = {};
  // OCR rarely reproduces LinkedIn's "·" separator faithfully — it comes back as
  // ".", "-", "–" or "•" depending on the screenshot. Normalise any standalone
  // separator (one surrounded by spaces) to "·" so the rules below see a
  // consistent shape. Spacing is what makes this safe: "Inc." and "St. Jude"
  // have no space before the dot and are left alone.
  const text = (rawText ?? "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ [.\-–—•*] /g, " · ");
  const allLines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // 1) LinkedIn URL — only if visibly present.
  const urlMatch = text.match(LINKEDIN_URL_RE);
  if (urlMatch) {
    const raw = urlMatch[0];
    draft.linkedinUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  }

  // Drop obvious UI chrome so it can't be mistaken for content.
  const lines = allLines.filter((l) => !isChrome(l.toLowerCase()));

  // 2) Name — topmost name-shaped line.
  // Take the topmost plausible name. The loose test only applies near the top of
  // the screenshot, where the name actually is — otherwise a strict match
  // further down (the company line, say) would win over an OCR-mangled name.
  let nameIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (looksLikeName(lines[i]) || (i < 8 && looksLikeNameLoose(lines[i]))) { nameIdx = i; break; }
  }
  if (nameIdx >= 0) {
    const parts = stripNameDecorations(lines[nameIdx]).split(/\s+/);
    draft.firstName = titleCaseWord(parts[0]);
    draft.lastName = parts.slice(1).map(titleCaseWord).join(" ");
  }

  // 3) Headline → role (+ maybe company). The first substantive line after the
  //    name. Only searched when a name was found — otherwise arbitrary/garbage
  //    lines would be mislabelled as a role.
  let headline: string | undefined;
  if (nameIdx >= 0) {
    for (let i = nameIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (CONNECTIONS_RE.test(l)) continue;     // skip "500+ connections"
      if (LINKEDIN_URL_RE.test(l)) continue;    // skip a bare profile URL line
      // A pure location line is not a role — but a headline that happens to
      // end in a city still is, so only skip when no role wording is present.
      if (LOCATION_HINT_RE.test(l) && !ROLE_KEYWORDS.test(l)) continue;
      if (!/[A-Za-zÀ-ÿ]{2,}/.test(l)) continue; // needs real letters, not glyphs
      headline = l;
      break;
    }
  }
  if (headline) {
    const atMatch = headline.match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
    if (atMatch) {
      draft.role = atMatch[1].trim();
      const co = cleanCompany(atMatch[2]);
      if (co) draft.company = co;
    } else {
      const seg = headline.split(/\s*[|•·]\s*/).map((s) => s.trim()).filter(Boolean);
      draft.role = seg[0];
      if (seg.length >= 2) {
        const cand = seg.slice(1).map(cleanCompany).find(looksLikeCompanyName);
        if (cand) draft.company = cand;
      }
    }
  }

  // 4) Company fallback. On a real profile the employer usually sits on its own
  //    line just under the headline ("Northwind Labs", "Northwind Labs ·
  //    Full-time"), so look there first, then fall back to a suffix match
  //    anywhere. Bounded to a few lines so an unrelated Experience entry
  //    further down isn't picked up.
  if (!draft.company && headline) {
    const start = lines.indexOf(headline) + 1;
    for (let i = start; i < Math.min(start + 4, lines.length); i++) {
      const cand = cleanCompany(lines[i]);
      if (LINKEDIN_URL_RE.test(cand)) continue;
      if (looksLikeCompanyName(cand)) { draft.company = cand; break; }
    }
  }
  if (!draft.company) {
    const bySuffix = lines.find(
      (l) => l !== headline && COMPANY_SUFFIX.test(l) && !ROLE_KEYWORDS.test(l) && !/@/.test(l),
    );
    if (bySuffix) draft.company = cleanCompany(bySuffix);
  }

  // 5) Location → notes. Exclude the chosen name line (by index) and the
  //    headline/company lines; a location can itself be title-case (e.g.
  //    "Greater Seattle Area"), so we don't exclude by name-shape here.
  let location: string | undefined;
  const locIdx = lines.findIndex(
    (l, i) =>
      i !== nameIdx &&
      l !== headline &&
      l !== draft.company &&
      !LINKEDIN_URL_RE.test(l) &&
      !ROLE_KEYWORDS.test(l) &&
      LOCATION_HINT_RE.test(l),
  );
  if (locIdx >= 0) {
    const candidate = lines[locIdx].split(/\s*[·•]\s*/)[0].trim();
    if (candidate.length <= 60 && !CONNECTIONS_RE.test(candidate)) location = candidate;
  }

  // 6) Notes — provenance + location.
  const noteParts = ["Imported from LinkedIn screenshot"];
  if (location) noteParts.push(`Location: ${location}`);
  draft.notes = noteParts.join("\n");

  return draft;
}

/** True when the draft has at least one field worth prefilling (notes alone don't count). */
export function hasUsableFields(d: LinkedInDraft): boolean {
  return !!(d.firstName || d.lastName || d.role || d.company || d.linkedinUrl);
}
