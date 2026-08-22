import { describe, it, expect } from "vitest";
import { extractContactFields } from "./businessCardParse";

// The reported failing card (clean OCR text). Must extract cleanly.
describe("extractContactFields — Borcelle / Aaron Loeb card", () => {
  const text = [
    "BORCELLE",
    "AARON LOEB",
    "MANAGER",
    "hello@reallygreatsite.com",
    "+123-456-7890",
    "123 Anywhere St., Any City",
    "www.reallygreatsite.com",
  ].join("\n");
  const d = extractContactFields(text);

  it("name", () => {
    expect(d.firstName).toBe("Aaron");
    expect(d.lastName).toBe("Loeb");
  });
  it("company (title-cased, not ALLCAPS)", () => {
    expect(d.company).toBe("Borcelle");
  });
  it("role (title-cased)", () => {
    expect(d.role).toBe("Manager");
  });
  it("email + phone (business cards show these)", () => {
    expect(d.email).toBe("hello@reallygreatsite.com");
    expect(d.phone).toBe("+123-456-7890");
  });
});

// Noisy OCR (design/logo bleed) — the real-world failure. Prefer BLANK over WRONG.
describe("extractContactFields — noisy OCR: blank over wrong", () => {
  const text = [
    "BORCELLE",
    "AR AARON LOEB", // leading OCR fragment "AR"
    "CARRS MANAGER", // "CARRS" is OCR noise glued onto the title
    "hello@reallygreatsite.com",
    "+123-456-7890",
  ].join("\n");
  const d = extractContactFields(text);

  it("does NOT emit the bad split (Ar / Aaron Loeb) — leaves name blank", () => {
    expect(d.firstName).toBeUndefined();
    expect(d.lastName).toBeUndefined();
  });
  it("cleans the contaminated role to just the title", () => {
    expect(d.role).toBe("Manager");
  });
  it("still gets company/email/phone right", () => {
    expect(d.company).toBe("Borcelle");
    expect(d.email).toBe("hello@reallygreatsite.com");
    expect(d.phone).toBe("+123-456-7890");
  });
});

describe("extractContactFields — casing & acronyms preserved", () => {
  it("keeps short acronyms (CEO, IBM) but title-cases long ALLCAPS words", () => {
    const d = extractContactFields(["Jane Smith", "CEO", "IBM"].join("\n"));
    expect(d.firstName).toBe("Jane");
    expect(d.lastName).toBe("Smith");
    expect(d.role).toBe("CEO");
    expect(d.company).toBe("IBM");
  });

  it("keeps legit multi-word titles via known modifiers", () => {
    const d = extractContactFields([
      "Priya Nair",
      "Senior Software Engineer",
      "Acme Labs",
    ].join("\n"));
    expect(d.role).toBe("Senior Software Engineer");
    expect(d.company).toBe("Acme Labs");
  });

  it("keeps a legitimate two-word title like Marketing Manager", () => {
    const d = extractContactFields(["Sam Rivera", "Marketing Manager", "Globex"].join("\n"));
    expect(d.role).toBe("Marketing Manager");
    expect(d.firstName).toBe("Sam");
  });
});

describe("extractContactFields — legitimate multi-word name still works", () => {
  it("accepts a 3-word name where every word is >= 3 chars", () => {
    const d = extractContactFields(["John Michael Smith", "Director", "Initech"].join("\n"));
    expect(d.firstName).toBe("John");
    expect(d.lastName).toBe("Michael Smith");
    expect(d.role).toBe("Director");
  });
});

describe("extractContactFields — company suffix path unchanged", () => {
  it("Tesla Inc via suffix", () => {
    const d = extractContactFields(["Alex Kim", "Engineer", "Tesla Inc"].join("\n"));
    expect(d.company).toBe("Tesla Inc");
    expect(d.role).toBe("Engineer");
  });
});
