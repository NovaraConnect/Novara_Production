import { describe, it, expect } from "vitest";
import {
  mergeLinkedInResult,
  normalizeLinkedInProfileUrl,
  type AiLinkedInResult,
} from "./linkedinMerge";
import { parseLinkedInProfile, type LinkedInDraft } from "./linkedinParse";

// Messy screenshot OCR: app chrome, the headline glued to the employer, the
// connection count, and the action buttons — the shape the deterministic
// parser struggles with.
const MESSY_OCR = [
  "Home  My Network  Jobs  Messaging  Notifications",
  "Priya Raman",
  "Head of Growth at Northwind Labs | ex-Acme",
  "Austin, Texas  ·  Contact info",
  "500+ connections",
  "Message   Connect   More",
].join("\n");

// A bullet-separated headline that hides the location inside the same line.
const BULLET_OCR = [
  "linkedin",
  "PRIYA RAMAN",
  "Growth lead • Northwind Labs • Austin, Texas",
  "1,204 followers",
  "Open to work",
].join("\n");

function ai(
  fields: Partial<AiLinkedInResult["fields"]>,
  confidence: AiLinkedInResult["confidence"] = "high",
): AiLinkedInResult {
  return {
    confidence,
    fields: {
      firstName: null,
      lastName: null,
      role: null,
      company: null,
      location: null,
      linkedinUrl: null,
      ...fields,
    },
  };
}

const DET: LinkedInDraft = {
  firstName: "Priya",
  lastName: "Raman",
  role: "Head of Growth at Northwind Labs | ex-Acme", // deterministic left the noise in
  notes: "Imported from LinkedIn screenshot",
};

describe("mergeLinkedInResult — AI improves a messy draft", () => {
  it("splits a glued headline into a clean role and company", () => {
    const out = mergeLinkedInResult(
      DET,
      ai({ role: "Head of Growth", company: "Northwind Labs" }),
    );
    expect(out.role).toBe("Head of Growth");
    expect(out.company).toBe("Northwind Labs");
  });

  it("improves on what the deterministic parser alone produced", () => {
    // Bullet-separated headline: the deterministic parser gets the role and
    // company, but the location is inside the same line and it misses it.
    const deterministic = parseLinkedInProfile(BULLET_OCR);
    expect(deterministic.notes).not.toContain("Location:");

    const refined = mergeLinkedInResult(
      deterministic,
      ai({
        firstName: "Priya",
        lastName: "Raman",
        role: "Growth Lead",
        company: "Northwind Labs",
        location: "Austin, Texas",
      }),
    );
    expect(refined.firstName).toBe("Priya");
    expect(refined.lastName).toBe("Raman");
    expect(refined.company).toBe("Northwind Labs");
    // The AI recovered what the deterministic pass could not.
    expect(refined.notes).toContain("Location: Austin, Texas");
  });

  it("fills AI gaps (null) from the deterministic draft", () => {
    const out = mergeLinkedInResult(DET, ai({ role: "Head of Growth" }));
    expect(out.role).toBe("Head of Growth"); // AI preferred
    expect(out.firstName).toBe("Priya"); // AI null → deterministic kept
    expect(out.lastName).toBe("Raman");
  });

  it("records location in the notes rather than a new field (no schema change)", () => {
    const out = mergeLinkedInResult(DET, ai({ location: "Austin, Texas" }));
    expect(out.notes).toContain("Imported from LinkedIn screenshot");
    expect(out.notes).toContain("Location: Austin, Texas");
    expect(out).not.toHaveProperty("location");
  });

  it("replaces an existing Location line instead of appending a second one", () => {
    const withLoc: LinkedInDraft = {
      ...DET,
      notes: "Imported from LinkedIn screenshot\nLocation: Somewhere Wrong",
    };
    const out = mergeLinkedInResult(withLoc, ai({ location: "Austin, Texas" }));
    expect(out.notes).toContain("Location: Austin, Texas");
    expect(out.notes).not.toContain("Somewhere Wrong");
    expect(out.notes!.match(/Location:/g)).toHaveLength(1);
  });
});

describe("mergeLinkedInResult — fallback behavior", () => {
  it("uses the deterministic draft unchanged when there is no AI result", () => {
    expect(mergeLinkedInResult(DET, null)).toEqual(DET);
  });

  it("uses the deterministic draft unchanged when AI confidence is low", () => {
    expect(mergeLinkedInResult(DET, ai({ firstName: "WRONG" }, "low"))).toEqual(DET);
  });

  it("ignores empty / whitespace-only AI values", () => {
    const out = mergeLinkedInResult(DET, ai({ firstName: "   ", company: "" }));
    expect(out.firstName).toBe("Priya");
    expect(out.company).toBeUndefined();
  });
});

describe("no email or phone reaches the draft", () => {
  it("drops contact fields even when the API response carries them", () => {
    // Simulates a server/model that ignored the contract and sent extra keys.
    const rogue = {
      confidence: "high",
      fields: {
        firstName: "Priya",
        lastName: "Raman",
        role: "Head of Growth",
        company: "Northwind Labs",
        location: null,
        linkedinUrl: null,
        email: "priya@northwind.example",
        phone: "+1 512 555 0100",
      },
    } as unknown as AiLinkedInResult;

    const out = mergeLinkedInResult(DET, rogue);
    expect(out).not.toHaveProperty("email");
    expect(out).not.toHaveProperty("phone");
    expect(JSON.stringify(out)).not.toContain("priya@northwind.example");
    expect(JSON.stringify(out)).not.toContain("555");
  });
});

describe("LinkedIn URL validation", () => {
  it("accepts and normalizes a real profile URL", () => {
    expect(normalizeLinkedInProfileUrl("linkedin.com/in/priya-raman")).toBe(
      "https://linkedin.com/in/priya-raman",
    );
    expect(
      normalizeLinkedInProfileUrl("https://www.linkedin.com/in/priya-raman/?trk=abc"),
    ).toBe("https://www.linkedin.com/in/priya-raman");
    expect(normalizeLinkedInProfileUrl("https://uk.linkedin.com/in/priya-raman")).toBe(
      "https://uk.linkedin.com/in/priya-raman",
    );
  });

  it("rejects off-platform and non-profile URLs", () => {
    expect(normalizeLinkedInProfileUrl("https://evil.example/in/priya")).toBeNull();
    expect(normalizeLinkedInProfileUrl("https://linkedin.com.evil.example/in/x")).toBeNull();
    expect(normalizeLinkedInProfileUrl("https://linkedin.com/company/northwind")).toBeNull();
    expect(normalizeLinkedInProfileUrl("not a url at all")).toBeNull();
    expect(normalizeLinkedInProfileUrl("")).toBeNull();
  });

  it("only takes the AI URL when it validates", () => {
    const good = mergeLinkedInResult(
      DET,
      ai({ linkedinUrl: "linkedin.com/in/priya-raman" }),
    );
    expect(good.linkedinUrl).toBe("https://linkedin.com/in/priya-raman");

    const bad = mergeLinkedInResult(
      { ...DET, linkedinUrl: "https://linkedin.com/in/kept" },
      ai({ linkedinUrl: "https://evil.example/in/priya" }),
    );
    expect(bad.linkedinUrl).toBe("https://linkedin.com/in/kept");
  });
});
