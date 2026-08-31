import { describe, it, expect } from "vitest";
import { planLinkedInImport, type AppliedImport, type FormSnapshot } from "./linkedinImportDraft";
import type { LinkedInDraft } from "./linkedinParse";

const EMPTY: FormSnapshot = {
  firstName: "",
  lastName: "",
  role: "",
  company: "",
  linkedinUrl: "",
  notes: "",
};

function snapshot(over: Partial<FormSnapshot> = {}): FormSnapshot {
  return { ...EMPTY, ...over };
}

/** Applies a plan the way the form does, so a sequence of imports can be tested. */
function apply(current: FormSnapshot, updates: Partial<FormSnapshot>): FormSnapshot {
  return { ...current, ...updates };
}

const FIRST_IMPORT: LinkedInDraft = {
  firstName: "Tatiana",
  lastName: "Fonseca",
  role: "Brand Partnerships",
  company: "IPSY",
  notes: "Imported from LinkedIn screenshot\nLocation: Miami-Fort Lauderdale Area",
};

describe("planLinkedInImport — a second import is a fresh draft", () => {
  it("clears a field the new screenshot has no value for", () => {
    // The reported bug: Company stayed "IPSY" from the previous screenshot.
    const first = planLinkedInImport(snapshot(), {}, FIRST_IMPORT);
    const afterFirst = apply(snapshot(), first.updates);
    expect(afterFirst.company).toBe("IPSY");

    const second = planLinkedInImport(afterFirst, first.applied, {
      firstName: "Marta",
      lastName: "Ferreira",
      notes: "Imported from LinkedIn screenshot",
    });
    const afterSecond = apply(afterFirst, second.updates);

    expect(afterSecond.firstName).toBe("Marta");
    expect(afterSecond.lastName).toBe("Ferreira");
    expect(afterSecond.company).toBe("");
    expect(afterSecond.role).toBe("");
  });

  it("replaces values the new screenshot does have", () => {
    const first = planLinkedInImport(snapshot(), {}, FIRST_IMPORT);
    const afterFirst = apply(snapshot(), first.updates);
    const second = planLinkedInImport(afterFirst, first.applied, {
      firstName: "Marta",
      lastName: "Ferreira",
      company: "University of Florida",
    });
    const afterSecond = apply(afterFirst, second.updates);
    expect(afterSecond.company).toBe("University of Florida");
  });

  it("does not carry the previous location note forward", () => {
    const first = planLinkedInImport(snapshot(), {}, FIRST_IMPORT);
    const afterFirst = apply(snapshot(), first.updates);
    expect(afterFirst.notes).toContain("Miami-Fort Lauderdale Area");

    const second = planLinkedInImport(afterFirst, first.applied, {
      firstName: "Marta",
      notes: "Imported from LinkedIn screenshot\nLocation: Gainesville, Florida",
    });
    const afterSecond = apply(afterFirst, second.updates);

    expect(afterSecond.notes).toContain("Location: Gainesville, Florida");
    expect(afterSecond.notes).not.toContain("Miami-Fort Lauderdale Area");
    expect(afterSecond.notes.match(/Imported from LinkedIn screenshot/g)).toHaveLength(1);
  });
});

describe("planLinkedInImport — the user's own typing survives", () => {
  it("keeps a value the user edited after the previous import", () => {
    const first = planLinkedInImport(snapshot(), {}, FIRST_IMPORT);
    const afterFirst = apply(snapshot(), first.updates);
    // User corrects the company by hand.
    const edited = { ...afterFirst, company: "IPSY Beauty" };

    const second = planLinkedInImport(edited, first.applied, { firstName: "Marta" });
    const afterSecond = apply(edited, second.updates);

    expect(afterSecond.company).toBe("IPSY Beauty"); // not cleared
    expect(afterSecond.firstName).toBe("Marta");
  });

  it("never clears fields it did not write", () => {
    const typed = snapshot({ firstName: "Hand", lastName: "Typed", company: "Acme" });
    const plan = planLinkedInImport(typed, {}, { role: "Head of Growth" });
    const after = apply(typed, plan.updates);

    expect(after.firstName).toBe("Hand");
    expect(after.lastName).toBe("Typed");
    expect(after.company).toBe("Acme");
    expect(after.role).toBe("Head of Growth");
  });

  it("preserves notes the user typed alongside the provenance line", () => {
    const first = planLinkedInImport(snapshot(), {}, FIRST_IMPORT);
    const afterFirst = apply(snapshot(), first.updates);
    const withUserNote = { ...afterFirst, notes: `Met at the beauty summit\n${afterFirst.notes}` };

    const second = planLinkedInImport(withUserNote, first.applied, {
      firstName: "Marta",
      notes: "Imported from LinkedIn screenshot",
    });
    const afterSecond = apply(withUserNote, second.updates);

    expect(afterSecond.notes).toContain("Met at the beauty summit");
    expect(afterSecond.notes).not.toContain("Miami-Fort Lauderdale Area");
  });
});

describe("planLinkedInImport — scope", () => {
  it("touches no field outside the import's own set", () => {
    const plan = planLinkedInImport(snapshot(), {}, FIRST_IMPORT);
    const keys = Object.keys(plan.updates).sort();
    for (const k of keys) {
      expect(["firstName", "lastName", "role", "company", "linkedinUrl", "notes"]).toContain(k);
    }
    // email / phone are not in the contract at any layer
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("phone");
  });

  it("a first import into an empty form writes only what it found", () => {
    const plan = planLinkedInImport(snapshot(), {}, { firstName: "Marta" });
    expect(plan.updates).toEqual({ firstName: "Marta" });
  });
});
