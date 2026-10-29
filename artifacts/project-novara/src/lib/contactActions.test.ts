import { describe, it, expect } from "vitest";
import { draftHref, DRAFT_EMAIL_SUBJECT } from "./contactActions";
import { Contact } from "@/types/contact";

const contact = {
  id: "c1",
  firstName: "Priya",
  lastName: "Raman",
  company: "Northwind Labs",
  phone: "+1 512 555 0100",
  email: "priya@northwind.example",
  linkedinUrl: "linkedin.com/in/priya-raman",
} as Contact;

const body = "Hi Priya, great meeting you & the team. Coffee soon?";

describe("draftHref", () => {
  it("prefills an SMS body in the form iOS and Android both accept", () => {
    expect(draftHref(contact, "text", body)).toBe(`sms:+15125550100?&body=${encodeURIComponent(body)}`);
  });

  it("prefills an email subject and body, encoding reserved characters", () => {
    const href = draftHref(contact, "email", body)!;
    expect(href.startsWith("mailto:priya@northwind.example?subject=")).toBe(true);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("subject")).toBe(DRAFT_EMAIL_SUBJECT);
    expect(params.get("body")).toBe(body);
  });

  it("has no compose link for LinkedIn (the draft is copied instead)", () => {
    expect(draftHref(contact, "linkedin", body)).toBeNull();
  });

  it("is null when the contact lacks the method's field", () => {
    expect(draftHref({ ...contact, phone: undefined }, "text", body)).toBeNull();
  });
});
