import { describe, it, expect } from "vitest";
import { contactLimit, FREE_CONTACT_LIMIT } from "./contactLimit";

describe("contactLimit", () => {
  it("keeps the six-contact ceiling for free users", () => {
    expect(FREE_CONTACT_LIMIT).toBe(6);
    expect(contactLimit(false)).toBe(6);
  });

  it("is unlimited for an active university entitlement", () => {
    const limit = contactLimit(true);
    expect(limit).toBe(Number.POSITIVE_INFINITY);
    // Any realistic count stays under the limit.
    expect(10_000 >= limit).toBe(false);
  });
});
