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

function isChrome(lineLower: string): boolean {
  if (UI_CHROME.has(lineLower)) return true;
  if (lineLower.length <= 2) return true; // stray glyphs / nav icons
  return false;
}

function titleCaseWord(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// 2–4 capitalized words, no digits/@, and not a job-title line.
function looksLikeName(line: string): boolean {
  if (/\d/.test(line) || /@/.test(line)) return false;
  if (ROLE_KEYWORDS.test(line)) return false; // "Product Manager" is not a name
  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((w) =>
    /^[A-ZÀ-Þ][a-zà-ÿ'’]+$/.test(w) ||          // Mixed case incl. accents (José)
    /^[A-ZÀ-Þ][A-ZÀ-Þ.'’-]+$/.test(w) ||        // ALLCAPS
    /^[A-Z][a-z]+-[A-Z][a-z]+$/.test(w),        // Hyphenated (Mary-Jane)
  );
}

export function parseLinkedInProfile(rawText: string): LinkedInDraft {
  const draft: LinkedInDraft = {};
  const text = (rawText ?? "").replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
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
  let nameIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (looksLikeName(lines[i])) { nameIdx = i; break; }
  }
  if (nameIdx >= 0) {
    const parts = lines[nameIdx].split(/\s+/);
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
      if (!/[A-Za-zÀ-ÿ]{2,}/.test(l)) continue; // needs real letters, not glyphs
      headline = l;
      break;
    }
  }
  if (headline) {
    const atMatch = headline.match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
    if (atMatch) {
      draft.role = atMatch[1].trim();
      const co = atMatch[2].split(/[|•·]/)[0].trim();
      if (co) draft.company = co;
    } else {
      const seg = headline.split(/\s*[|•·]\s*/).map((s) => s.trim()).filter(Boolean);
      draft.role = seg[0];
      if (seg.length >= 2) {
        const cand = seg.slice(1).find(
          (s) => COMPANY_SUFFIX.test(s) ||
            (/^[A-Z]/.test(s) && s.split(/\s+/).length <= 3 && !ROLE_KEYWORDS.test(s)),
        );
        if (cand) draft.company = cand;
      }
    }
  }

  // 4) Company fallback — a line carrying a company suffix (conservative;
  //    suffix-less companies inside Experience blocks are left for the user).
  if (!draft.company) {
    const bySuffix = lines.find(
      (l) => l !== headline && COMPANY_SUFFIX.test(l) && !ROLE_KEYWORDS.test(l) && !/@/.test(l),
    );
    if (bySuffix) draft.company = bySuffix.trim();
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
