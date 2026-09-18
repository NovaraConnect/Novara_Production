import { describe, it, expect } from "vitest";
import { findDuplicateContact } from "./contactDuplicates";
import type { Contact } from "@/types/contact";

function contact(overrides: Partial<Contact>): Contact {
  return {
    id: "id",
    firstName: "Sarah",
    lastName: "Jones",
    company: "Tesla",
    importance: "Medium",
    basePriority: "Medium",
    currentPriority: "Medium",
    priorityOverride: false,
    interests: [],
    initialFollowUpDays: 2,
    followUpCadenceDays: 42,
    cadenceOverride: false,
    connectionStatus: "connected",
    firstContactDate: "2026-01-01",
    lastInteractionDate: "2026-01-01",
    nextFollowUpDate: "2026-01-03",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("findDuplicateContact", () => {
  it("matches on email, ignoring case", () => {
    const existing = contact({ id: "a", email: "Sarah@Tesla.com" });
    const match = findDuplicateContact([existing], { email: "sarah@tesla.COM" });
    expect(match?.id).toBe("a");
  });

  it("matches on phone across different formatting", () => {
    const existing = contact({ id: "b", phone: "+1 (415) 555-0133" });
    const match = findDuplicateContact([existing], { phone: "4155550133" });
    expect(match?.id).toBe("b");
  });

  it("matches on full name plus company", () => {
    const existing = contact({ id: "c", firstName: "Sarah", lastName: "Jones", company: "Tesla" });
    const match = findDuplicateContact([existing], {
      firstName: "  sarah ",
      lastName: "JONES",
      company: "tesla",
    });
    expect(match?.id).toBe("c");
  });

  it("does not match on name alone when the company differs", () => {
    const existing = contact({ id: "d", company: "Tesla" });
    expect(
      findDuplicateContact([existing], { firstName: "Sarah", lastName: "Jones", company: "Rivian" }),
    ).toBeNull();
  });

  it("does not match a short or empty phone number", () => {
    const existing = contact({ id: "e", phone: "0133" });
    expect(findDuplicateContact([existing], { phone: "0133" })).toBeNull();
    expect(findDuplicateContact([existing], { phone: "" })).toBeNull();
  });

  it("ignores contacts with no comparable fields", () => {
    const existing = contact({ id: "f" });
    expect(findDuplicateContact([existing], {})).toBeNull();
  });

  it("prefers an email match over a name match", () => {
    const byName = contact({ id: "name", firstName: "Sarah", lastName: "Jones", company: "Tesla" });
    const byEmail = contact({ id: "email", firstName: "S", lastName: "J", company: "X", email: "s@t.com" });
    const match = findDuplicateContact([byName, byEmail], {
      firstName: "Sarah",
      lastName: "Jones",
      company: "Tesla",
      email: "s@t.com",
    });
    expect(match?.id).toBe("email");
  });
});
