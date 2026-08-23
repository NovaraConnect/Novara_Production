import { describe, it, expect } from "vitest";
import { mergeCardResult, isValidEmail, isValidPhone, normalizeWebsite, type AiCardResult } from "./cardMerge";
import type { ScannedContact } from "./businessCardParse";

const DET: ScannedContact = {
  firstName: "Aaron",
  lastName: "Loeb",
  company: "Borcelle",
  role: "Manager",
  email: "hello@reallygreatsite.com",
  phone: "+123-456-7890",
};

function ai(fields: Partial<AiCardResult["fields"]>, confidence: AiCardResult["confidence"] = "high"): AiCardResult {
  return {
    confidence,
    fields: {
      firstName: null, lastName: null, company: null, role: null,
      email: null, phone: null, website: null, ...fields,
    },
  };
}

describe("mergeCardResult — fallback behavior", () => {
  it("uses deterministic unchanged when there is no AI result", () => {
    expect(mergeCardResult(DET, null)).toEqual(DET);
  });

  it("uses deterministic unchanged when AI confidence is low", () => {
    expect(mergeCardResult(DET, ai({ firstName: "WRONG" }, "low"))).toEqual(DET);
  });

  it("fills AI gaps (null) from the deterministic draft", () => {
    const out = mergeCardResult(DET, ai({ role: "Sales Manager" }));
    expect(out.role).toBe("Sales Manager"); // AI preferred
    expect(out.firstName).toBe("Aaron");     // AI null → deterministic kept
    expect(out.company).toBe("Borcelle");
  });
});

describe("mergeCardResult — AI contact fields are re-validated", () => {
  it("keeps a valid AI email/phone", () => {
    const out = mergeCardResult(DET, ai({ email: "New.Person@Example.COM", phone: "(415) 555 0100" }));
    expect(out.email).toBe("new.person@example.com");
    expect(out.phone).toBe("(415) 555 0100");
  });

  it("drops an invalid AI email/phone and keeps the deterministic value", () => {
    const out = mergeCardResult(DET, ai({ email: "not-an-email", phone: "12" }));
    expect(out.email).toBe("hello@reallygreatsite.com");
    expect(out.phone).toBe("+123-456-7890");
  });

  it("normalizes a valid website and rejects junk", () => {
    expect(mergeCardResult(DET, ai({ website: "reallygreatsite.com" })).website).toBe("https://reallygreatsite.com");
    expect(mergeCardResult(DET, ai({ website: "not a url" })).website).toBeUndefined();
  });
});

describe("validators", () => {
  it("email", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("nope")).toBe(false);
  });
  it("phone (7..15 digits)", () => {
    expect(isValidPhone("+123-456-7890")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
  });
  it("website", () => {
    expect(normalizeWebsite("https://x.com")).toBe("https://x.com");
    expect(normalizeWebsite("x.com")).toBe("https://x.com");
    expect(normalizeWebsite("localhost")).toBeNull();
  });
});
