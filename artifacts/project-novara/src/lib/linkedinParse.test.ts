import { describe, it, expect } from "vitest";
import { parseLinkedInProfile, hasUsableFields } from "./linkedinParse";

// All fixtures are SYNTHETIC OCR text (not real people, no real images). They
// approximate what tesseract returns from LinkedIn profile screenshots.

describe("parseLinkedInProfile — headline with 'at Company'", () => {
  const text = [
    "Jane Cooper",
    "Senior Product Manager at Tesla",
    "San Francisco Bay Area · 500+ connections",
  ].join("\n");
  const d = parseLinkedInProfile(text);

  it("extracts name, role and company", () => {
    expect(d.firstName).toBe("Jane");
    expect(d.lastName).toBe("Cooper");
    expect(d.role).toBe("Senior Product Manager");
    expect(d.company).toBe("Tesla");
  });
  it("puts location and provenance in notes", () => {
    expect(d.notes).toContain("Imported from LinkedIn screenshot");
    expect(d.notes).toContain("San Francisco Bay Area");
  });
  it("never extracts email or phone", () => {
    expect((d as Record<string, unknown>).email).toBeUndefined();
    expect((d as Record<string, unknown>).phone).toBeUndefined();
  });
});

describe("parseLinkedInProfile — pipe-separated headline", () => {
  const text = [
    "Marcus Lee",
    "Marketing Lead | L'Oréal | Paris",
    "Paris, Île-de-France, France · Contact info",
  ].join("\n");
  const d = parseLinkedInProfile(text);

  it("takes the first segment as role and a company segment", () => {
    expect(d.firstName).toBe("Marcus");
    expect(d.role).toBe("Marketing Lead");
    expect(d.company).toBe("L'Oréal");
  });
  it("captures location into notes", () => {
    expect(d.notes).toContain("Paris, Île-de-France, France");
  });
});

describe("parseLinkedInProfile — company via suffix, no 'at'", () => {
  const text = [
    "Priya Nair",
    "Product Manager",
    "Acme Analytics Inc",
    "Bengaluru, Karnataka, India · 1,024 followers",
  ].join("\n");
  const d = parseLinkedInProfile(text);

  it("uses the headline for role and a suffixed line for company", () => {
    expect(d.firstName).toBe("Priya");
    expect(d.lastName).toBe("Nair");
    expect(d.role).toBe("Product Manager");
    expect(d.company).toBe("Acme Analytics Inc");
  });
});

describe("parseLinkedInProfile — LinkedIn URL", () => {
  it("captures a visible profile URL and normalizes to https", () => {
    const d = parseLinkedInProfile([
      "Alex Kim",
      "UX Designer at Figma",
      "linkedin.com/in/alex-kim-234",
    ].join("\n"));
    expect(d.linkedinUrl).toBe("https://linkedin.com/in/alex-kim-234");
    expect(d.role).toBe("UX Designer");
    expect(d.company).toBe("Figma");
  });

  it("leaves linkedinUrl undefined when no URL is visible", () => {
    const d = parseLinkedInProfile([
      "Sam Rivera",
      "Data Scientist at Netflix",
      "Greater Seattle Area",
    ].join("\n"));
    expect(d.linkedinUrl).toBeUndefined();
    expect(d.company).toBe("Netflix");
    expect(d.notes).toContain("Greater Seattle Area");
  });
});

describe("parseLinkedInProfile — accented name, non-English headline", () => {
  const d = parseLinkedInProfile([
    "José Álvarez",
    "Ingeniero de Software en Globant",
    "Madrid, Comunidad de Madrid, España",
  ].join("\n"));

  it("extracts the accented name and degrades gracefully on the headline", () => {
    expect(d.firstName).toBe("José");
    expect(d.lastName).toBe("Álvarez");
    expect(d.role).toBeTruthy(); // role captured; company may be blank (known limitation)
    expect(hasUsableFields(d)).toBe(true);
  });
});

describe("parseLinkedInProfile — Contact-info leak must NOT yield email/phone", () => {
  const d = parseLinkedInProfile([
    "Dana Fox",
    "Recruiter at Google",
    "dana.fox@example.com",
    "+1 (415) 555-0132",
    "San Francisco, California",
  ].join("\n"));

  it("extracts safe fields", () => {
    expect(d.firstName).toBe("Dana");
    expect(d.role).toBe("Recruiter");
    expect(d.company).toBe("Google");
  });
  it("guardrail: email and phone are never populated even when visible", () => {
    expect((d as Record<string, unknown>).email).toBeUndefined();
    expect((d as Record<string, unknown>).phone).toBeUndefined();
    // And they don't leak into notes either.
    expect(d.notes).not.toContain("@");
    expect(d.notes).not.toContain("555");
  });
});

describe("parseLinkedInProfile — blurry / unrecognizable text", () => {
  const d = parseLinkedInProfile(["###  ~~~", "1l0 |||", "xzq"].join("\n"));

  it("returns no usable fields (component shows the manual-entry message)", () => {
    expect(d.firstName).toBeUndefined();
    expect(d.role).toBeUndefined();
    expect(d.company).toBeUndefined();
    expect(d.linkedinUrl).toBeUndefined();
    expect(hasUsableFields(d)).toBe(false);
  });
});

describe("parseLinkedInProfile — a connections line is not mistaken for company", () => {
  it("does not set company from a followers/connections line", () => {
    const d = parseLinkedInProfile([
      "Riley Stone",
      "Software Engineer at Stripe",
      "1,200 followers",
    ].join("\n"));
    expect(d.company).toBe("Stripe");
  });
});

// ── Real-screenshot shapes ──────────────────────────────────────────────────
// Every case below was a live failure found during QA on realistic layouts:
// the earlier parser rejected decorated name lines and then accepted UI chrome,
// a location, or a wrapped headline fragment in their place.
describe("realistic LinkedIn screenshot layouts", () => {
  it("reads a name carrying a connection-degree badge, not the button row", () => {
    const d = parseLinkedInProfile(
      [
        "Priya Raman · 2nd",
        "Head of Growth at Northwind Labs",
        "Austin, Texas, United States · Contact info",
        "2,431 followers · 500+ connections",
        "Message   Connect   More",
      ].join("\n"),
    );
    expect(d.firstName).toBe("Priya");
    expect(d.lastName).toBe("Raman");
    expect(d.role).toBe("Head of Growth");
    expect(d.company).toBe("Northwind Labs");
    expect(d.notes).toContain("Location: Austin, Texas, United States");
  });

  it("never takes an action-button row as the name", () => {
    const d = parseLinkedInProfile(
      ["Message   Connect   More", "Following", "See all"].join("\n"),
    );
    expect(d.firstName).toBeUndefined();
    expect(d.lastName).toBeUndefined();
  });

  it("handles an honorific and a credential suffix", () => {
    const d = parseLinkedInProfile(
      ["Dr. Priya Raman, MBA", "Chief Marketing Officer", "Northwind Labs", "San Francisco Bay Area"].join("\n"),
    );
    expect(d.firstName).toBe("Priya");
    expect(d.lastName).toBe("Raman");
    expect(d.role).toBe("Chief Marketing Officer");
    expect(d.company).toBe("Northwind Labs");
  });

  it("handles pronouns next to the name", () => {
    const d = parseLinkedInProfile(
      ["Priya Raman (she/her)", "Product Manager at Acme Corp", "1,204 followers", "Message"].join("\n"),
    );
    expect(d.firstName).toBe("Priya");
    expect(d.lastName).toBe("Raman");
    expect(d.company).toBe("Acme Corp");
  });

  it("takes the employer line, not a wrapped headline fragment", () => {
    const d = parseLinkedInProfile(
      [
        "Priya Raman",
        "Head of Growth | Building demand engines",
        "for B2B SaaS | ex-Acme",
        "Northwind Labs",
        "Austin, Texas, United States",
        "500+ connections",
      ].join("\n"),
    );
    expect(d.role).toBe("Head of Growth");
    expect(d.company).toBe("Northwind Labs");
  });

  it("strips employment type from the company", () => {
    const d = parseLinkedInProfile(
      ["Priya Raman", "Head of Growth", "Northwind Labs · Full-time", "Jan 2023 - Present · 2 yrs 8 mos", "Austin, Texas"].join("\n"),
    );
    expect(d.company).toBe("Northwind Labs");
  });

  it("never reports a location as the role", () => {
    const d = parseLinkedInProfile(
      ["Priya Raman", "San Francisco Bay Area", "500+ connections"].join("\n"),
    );
    expect(d.role).toBeUndefined();
  });

  it("survives OCR reading the '·' separator as '.' or '-'", () => {
    // What tesseract actually returns for a real screenshot: the middot is
    // rendered as a period or hyphen, so every "·" rule has to see it anyway.
    const d = parseLinkedInProfile(
      [
        "Priya Raman . 2nd",
        "Head of Growth at Northwind Labs",
        "Austin, Texas, United States . Contact info",
        "2,431 followers . 500+ connections",
        "Message    Connect    More",
        "Experience",
        "Northwind Labs - Full-time",
      ].join("\n"),
    );
    expect(d.firstName).toBe("Priya");
    expect(d.lastName).toBe("Raman");
    expect(d.role).toBe("Head of Growth");
    expect(d.company).toBe("Northwind Labs");
    expect(d.notes).toContain("Location: Austin, Texas, United States");
  });

  it("reads a name OCR mangled the capitalisation of", () => {
    const d = parseLinkedInProfile(
      ["PRIYA raman", "Head of Growth", "Northwind Labs", "Austin, Texas"].join("\n"),
    );
    expect(d.firstName).toBe("Priya");
    expect(d.lastName).toBe("Raman");
    expect(d.role).toBe("Head of Growth");
  });

  it("handles a middle initial and a verification glyph", () => {
    const a = parseLinkedInProfile(["Priya K. Raman", "Head of Growth", "Northwind Labs"].join("\n"));
    expect(a.firstName).toBe("Priya");
    const b = parseLinkedInProfile(["Priya Raman \u2713", "Head of Growth at Northwind Labs"].join("\n"));
    expect(b.firstName).toBe("Priya");
    expect(b.lastName).toBe("Raman");
  });

  it("keeps name particles lowercase", () => {
    const d = parseLinkedInProfile(["Ana Maria de la Cruz", "Product Manager at Acme Corp"].join("\n"));
    expect(d.lastName).toBe("Maria de la Cruz");
  });

  it("ignores phone status-bar noise above the name", () => {
    const d = parseLinkedInProfile(["9:41", "Priya Raman", "Head of Growth", "Northwind Labs"].join("\n"));
    expect(d.firstName).toBe("Priya");
    expect(d.role).toBe("Head of Growth");
  });

  it("leaves an abbreviation's period alone (no space before it)", () => {
    const d = parseLinkedInProfile(
      ["Priya Raman", "Head of Growth", "Northwind Labs Inc."].join("\n"),
    );
    expect(d.company).toBe("Northwind Labs Inc.");
  });
});
