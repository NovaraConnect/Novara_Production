// ============================================================================
// Deterministic parser for OCR text from a business-card image. Pure + testable.
// Extracted from BusinessCardScanner so it can be unit-tested and hardened.
//
// Principle: ACCURACY OVER COMPLETENESS — a blank field is better than a wrong
// one. When name or role parsing is uncertain/contaminated by OCR noise, we
// leave the field blank rather than guess.
//
// Business cards legitimately show email/phone, so (unlike LinkedIn) those ARE
// extracted here.
// ============================================================================

export interface ScannedContact {
  firstName?: string;
  lastName?: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
}

const ROLE_KEYWORDS =
  /\b(CEO|CFO|CTO|COO|CMO|CRO|VP|SVP|EVP|MD|GM|Director|Manager|Engineer|Developer|Designer|President|Founder|Co-Founder|Partner|Associate|Consultant|Analyst|Officer|Coordinator|Lead|Head|Principal|Senior|Junior|Account|Executive|Specialist|Strategist|Producer|Architect|Scientist|Researcher|Advisor|Representative|Recruiter|Talent)\b/i;

const COMPANY_SUFFIXES =
  /\b(Inc\.?|LLC|Ltd\.?|Corp\.?|Co\.?|Company|Group|Solutions|Technologies?|Tech|Services?|Systems?|Associates?|Partners?|Global|International|Studios?|Agency|Ventures?|Capital|Bank|Financial|Holdings?|Foundation|Labs?|Laboratories?|Institute|Consulting|Advisors?|Investments?|Management)\b/i;

// Words that legitimately sit alongside a role keyword in a job title. Used to
// keep clean titles ("Marketing Manager", "Senior Software Engineer") while
// dropping OCR noise glued onto the role line ("CARRS Manager" -> "Manager").
const ROLE_MODIFIERS = new Set([
  "senior", "junior", "lead", "head", "chief", "assistant", "associate",
  "deputy", "vice", "executive", "general", "regional", "global", "managing",
  "principal", "marketing", "sales", "product", "project", "program", "account",
  "operations", "finance", "financial", "technical", "creative", "digital",
  "business", "development", "software", "hardware", "data", "design", "content",
  "brand", "customer", "people", "talent", "engineering", "research", "strategy",
  "growth", "communications", "partnerships", "field", "national", "international",
]);

/** ALLCAPS words longer than 4 chars → Title Case; short ALLCAPS (CEO, VP, LLC,
 *  IBM) are kept as-is (acronyms); mixed-case words are left untouched. */
function smartCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => {
      if (/^[A-ZÀ-Þ]{2,}$/.test(w)) return w.length > 4 ? w[0] + w.slice(1).toLowerCase() : w;
      return w;
    })
    .join(" ");
}

function titleCaseWord(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// A single name-shaped token: Titlecase, ALLCAPS, or Hyphenated (accents ok).
function isNameWord(w: string): boolean {
  return (
    /^[A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜ][a-záéíóúàèìòùäëïöü]+$/.test(w) ||
    /^[A-ZÁÉÍÓÚ-]+$/.test(w) ||
    /^[A-ZÁ][a-z]+-[A-ZÁ][a-z]+$/.test(w)
  );
}

/** Clean a role line: keep the contiguous run of role-keyword/modifier words
 *  around the primary keyword, dropping OCR noise glued on. Returns undefined
 *  if no keyword is present. */
function cleanRole(line: string): string | undefined {
  const words = line.trim().split(/\s+/);
  const isKw = (w: string) => ROLE_KEYWORDS.test(w);
  const isMod = (w: string) => ROLE_MODIFIERS.has(w.toLowerCase().replace(/[^a-zà-ÿ]/g, ""));
  const k = words.findIndex(isKw);
  if (k < 0) return undefined;
  let lo = k;
  let hi = k;
  while (lo - 1 >= 0 && (isKw(words[lo - 1]) || isMod(words[lo - 1]))) lo--;
  while (hi + 1 < words.length && (isKw(words[hi + 1]) || isMod(words[hi + 1]))) hi++;
  const span = smartCase(words.slice(lo, hi + 1).join(" ")).trim();
  return span || undefined;
}

export function extractContactFields(rawText: string): ScannedContact {
  const result: ScannedContact = {};

  const text = (rawText ?? "").replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // ── Email ──
  const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0].toLowerCase();

  // ── Phone ── matched PER LINE so the pattern's whitespace class can't run
  // across a newline into a following address line
  // ("+123-456-7890" + "\n123 Anywhere St." must yield just the phone).
  const phoneRe =
    /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|(\+\d{1,3}[-.\s]?)(\(?\d{1,4}\)?[-.\s]?){2,6}\d{2,}/;
  for (const l of lines) {
    const m = l.match(phoneRe);
    if (m) {
      const candidate = m[0].trim();
      const digits = candidate.replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15) { result.phone = candidate; break; }
    }
  }

  // Track which lines are already consumed.
  const usedLines = new Set<string>();
  if (result.email) {
    lines.forEach((l) => { if (l.toLowerCase().includes(result.email!.toLowerCase())) usedLines.add(l); });
  }
  if (result.phone) {
    lines.forEach((l) => { if (l.replace(/\D/g, "").includes(result.phone!.replace(/\D/g, "").slice(0, 7))) usedLines.add(l); });
  }
  lines.forEach((l) => {
    if (/^(www\.|https?:\/\/|http:\/\/)/i.test(l)) usedLines.add(l);
    if (/\.(com|org|net|io|co\.)/i.test(l) && !/@/.test(l)) usedLines.add(l);
  });

  // ── Company — pass 1: explicit suffix (Tesla Inc, Google LLC) ──
  const companyBySuffix = lines.find((l) => {
    if (usedLines.has(l)) return false;
    if (/^\+?\(?\d/.test(l)) return false;
    return COMPANY_SUFFIXES.test(l);
  });
  if (companyBySuffix) { result.company = smartCase(companyBySuffix.trim()); usedLines.add(companyBySuffix); }

  // ── Role ── find a line with a role keyword, then de-noise it.
  const roleLine = lines.find((l) => {
    if (usedLines.has(l)) return false;
    if (/^\+?\(?\d/.test(l)) return false;
    return ROLE_KEYWORDS.test(l);
  });
  if (roleLine) {
    usedLines.add(roleLine);
    const cleaned = cleanRole(roleLine);
    if (cleaned) result.role = cleaned; // leave blank if de-noising yields nothing
  }

  // ── Name ── prefer a clean 2-word name. Accept a 3–4 word name ONLY when
  // every word is >= 3 chars (a short leading token like "AR" signals OCR
  // noise → we blank the name rather than emit "Ar" / "Aaron Loeb").
  const nameCandidates = lines.filter((l) => {
    if (usedLines.has(l)) return false;
    if (/\d/.test(l) || /@/.test(l)) return false;
    if (ROLE_KEYWORDS.test(l)) return false;
    const words = l.split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;
    return words.every(isNameWord);
  });
  let nameLine = nameCandidates.find((l) => l.split(/\s+/).length === 2);
  if (!nameLine) {
    nameLine = nameCandidates.find((l) => {
      const w = l.split(/\s+/);
      return w.length >= 3 && w.every((x) => x.length >= 3);
    });
  }
  // Consume ALL name candidates so a rejected noisy one can't resurface as company.
  nameCandidates.forEach((l) => usedLines.add(l));
  if (nameLine) {
    const parts = nameLine.split(/\s+/);
    const firstName = titleCaseWord(parts[0]);
    const lastName = parts.slice(1).map(titleCaseWord).join(" ");
    if (firstName.length >= 2 && lastName.length >= 2) {
      result.firstName = firstName;
      result.lastName = lastName;
    }
  }

  // ── Company — pass 2: standalone brand name (no suffix) ──
  if (!result.company) {
    const companyByShape = lines.find((l) => {
      if (usedLines.has(l)) return false;
      if (/^\+?\(?\d/.test(l)) return false;
      if (/@/.test(l)) return false;
      if (ROLE_KEYWORDS.test(l)) return false;
      const words = l.split(/\s+/);
      if (words.length < 1 || words.length > 5) return false;
      return words.every((w) => /^[A-Z]/.test(w) && /^[A-Za-z&.,-]+$/.test(w));
    });
    if (companyByShape) { result.company = smartCase(companyByShape.trim()); usedLines.add(companyByShape); }
  }

  return result;
}
