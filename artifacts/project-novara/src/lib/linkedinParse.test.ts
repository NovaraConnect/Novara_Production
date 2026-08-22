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
