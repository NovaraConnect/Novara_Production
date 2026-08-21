import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
const router = Router();

interface LinkedInProfile {
  firstName?: string;
  lastName?: string;
  role?: string;
  company?: string;
  location?: string;
  linkedinUrl?: string;
}

function extractFromJsonLd(html: string): LinkedInProfile {
  const result: LinkedInProfile = {};
  const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const person = Array.isArray(data) ? data.find((d: Record<string, unknown>) => d["@type"] === "Person") : data["@type"] === "Person" ? data : null;
      if (person) {
        const fullName: string = person.name ?? "";
        const parts = fullName.trim().split(/\s+/);
        result.firstName = parts[0] ?? "";
        result.lastName = parts.slice(1).join(" ") ?? "";
        result.role = person.jobTitle ?? person.headline ?? "";
        const works = person.worksFor;
        if (works) {
          result.company = Array.isArray(works) ? works[0]?.name ?? "" : works.name ?? "";
        }
        result.location = person.address?.addressLocality ?? "";
      }
    } catch {
    }
  }
  return result;
}

function extractFromMeta(html: string): LinkedInProfile {
  const result: LinkedInProfile = {};

  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];

  if (ogTitle) {
    const cleaned = ogTitle.replace(/\s*[-|].*$/, "").trim();
    const parts = cleaned.split(/\s+/);
    result.firstName = parts[0] ?? "";
    result.lastName = parts.slice(1).join(" ") ?? "";
  }

  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1];

  if (ogDesc) {
    const atMatch = ogDesc.match(/^([^·•|]+?)\s+(?:at|@)\s+([^·•|]+)/i);
    if (atMatch) {
      result.role = atMatch[1].trim();
      result.company = atMatch[2].trim().replace(/\s*[·•|].*$/, "").trim();
    } else {
      const parts = ogDesc.split(/[·•|]/);
      if (parts.length >= 2) {
        result.role = parts[0].trim();
        result.company = parts[1].trim();
      }
    }
  }

  return result;
}

function extractFromTitle(html: string): LinkedInProfile {
  const result: LinkedInProfile = {};
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].replace(/\s*[-|].*LinkedIn.*$/i, "").trim();
    if (title && !title.toLowerCase().includes("linkedin")) {
      const parts = title.split(/\s+/);
      result.firstName = parts[0] ?? "";
      result.lastName = parts.slice(1).join(" ") ?? "";
    }
  }
  return result;
}

// Only allow requests to LinkedIn's own profile pages, validated on the
// parsed hostname (not a substring match) to prevent server-side request
// forgery against internal or third-party hosts.
function toSafeLinkedInProfileUrl(input: string): string | null {
  let candidate = input.trim();
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  const isLinkedInHost = host === "linkedin.com" || host === "www.linkedin.com";
  if (!isLinkedInHost) return null;
  if (!/^\/in\//i.test(parsed.pathname)) return null;
  parsed.search = "";
  parsed.hash = "";
  let normalized = parsed.toString();
  if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized;
}

router.post("/linkedin/import", requireAuth, async (req, res) => {
  const { url } = req.body as { url?: string };

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Missing url in request body" });
    return;
  }

const profileUrl = toSafeLinkedInProfileUrl(url);
      if (!profileUrl) {
              res.status(400).json({ error: "URL does not appear to be a LinkedIn profile URL" });
              return;
      }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(profileUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    const html = await response.text();

    const profile: LinkedInProfile = {
      linkedinUrl: profileUrl,
    };

    const fromJsonLd = extractFromJsonLd(html);
    const fromMeta = extractFromMeta(html);
    const fromTitle = extractFromTitle(html);

    profile.firstName = fromJsonLd.firstName || fromMeta.firstName || fromTitle.firstName || "";
    profile.lastName = fromJsonLd.lastName || fromMeta.lastName || fromTitle.lastName || "";
    profile.role = fromJsonLd.role || fromMeta.role || "";
    profile.company = fromJsonLd.company || fromMeta.company || "";
    profile.location = fromJsonLd.location || "";

    const slugMatch = profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
    let parsedFromSlug = false;
    if (!profile.firstName && !profile.lastName && slugMatch) {
      parsedFromSlug = true;
      const rawSlug = slugMatch[1];
      const parts = rawSlug.split("-");

      // Strip the trailing segment if it looks like a LinkedIn unique ID:
      // must be 4+ characters long AND contain at least one digit (e.g. "8a72b1", "12345", "ab1234").
      // Real name/credential segments like "mba" or "jr" have no digits, so they're kept.
      const lastPart = parts[parts.length - 1];
      const isId = lastPart.length >= 4 && /\d/.test(lastPart);
      const nameParts = isId ? parts.slice(0, -1) : parts;

      if (nameParts.length === 0) {
        // Nothing left after stripping — fall back to the raw slug, title-cased
        profile.firstName = rawSlug.charAt(0).toUpperCase() + rawSlug.slice(1);
        profile.lastName = "";
      } else if (nameParts.length === 1) {
        // Single word (no hyphens or all stripped) — put in first name, leave last blank
        profile.firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
        profile.lastName = "";
      } else {
        // Two or more words: first → First Name, rest → Last Name
        profile.firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
        profile.lastName = nameParts
          .slice(1)
          .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(" ");
      }
    }

    const hasData = profile.firstName || profile.role || profile.company;
    if (!hasData) {
      res.status(422).json({
        error: "LinkedIn blocked this request. Try again or fill in manually.",
        partial: profile,
      });
      return;
    }

    res.json({ ...profile, parsedFromSlug });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isAbort = message.includes("abort") || message.includes("timeout");
    res.status(502).json({
      error: isAbort
        ? "Request timed out. LinkedIn may be blocking access."
        : "Could not reach LinkedIn. Try again or fill in manually.",
    });
  }
});

export default router;
