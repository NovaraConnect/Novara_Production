// ============================================================================
// Contact-method actions for the "Contact now" button. Isolated here so the
// external-link mechanics can be swapped for a Capacitor plugin later without
// touching the UI. Web + Capacitor compatible; never auto-sends anything.
//   • sms:    → window.location.href (OS routes to Messages / native SMS app)
//   • mailto: → window.location.href (OS routes to the mail app)
//   • https   → window.open(_blank)  (new tab in the browser / in-app browser)
// Phone-call (tel:) is intentionally NOT a supported method.
// ============================================================================
import { Contact } from "@/types/contact";

export type ContactMethod = "text" | "email" | "linkedin";

export const METHOD_LABEL: Record<ContactMethod, string> = {
  text: "Text",
  email: "Email",
  linkedin: "LinkedIn",
};

/** The field a method needs, for gentle form validation copy. */
export const METHOD_FIELD_LABEL: Record<ContactMethod, string> = {
  text: "phone number",
  email: "email",
  linkedin: "LinkedIn URL",
};

/** Does the contact have the field a given method requires? */
export function hasMethodField(contact: Contact, method: ContactMethod): boolean {
  if (method === "text") return !!contact.phone?.trim();
  if (method === "email") return !!contact.email?.trim();
  return !!contact.linkedinUrl?.trim();
}

/** Methods the contact can actually be reached by, in a stable display order. */
export function availableMethods(contact: Contact): ContactMethod[] {
  return (["text", "email", "linkedin"] as ContactMethod[]).filter((m) => hasMethodField(contact, m));
}

/** The preferred method IF it is set AND its field exists — otherwise null. */
export function usablePreferred(contact: Contact): ContactMethod | null {
  const p = contact.preferredContactMethod;
  if ((p === "text" || p === "email" || p === "linkedin") && hasMethodField(contact, p)) return p;
  return null;
}

function withScheme(url: string): string {
  const t = url.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** External URL for a method, or null if the required field is missing. */
export function methodHref(contact: Contact, method: ContactMethod): string | null {
  if (method === "text" && contact.phone?.trim()) return `sms:${contact.phone.trim().replace(/\s+/g, "")}`;
  if (method === "email" && contact.email?.trim()) return `mailto:${contact.email.trim()}`;
  if (method === "linkedin" && contact.linkedinUrl?.trim()) return withScheme(contact.linkedinUrl);
  return null;
}

/** Open a method with safe external-link handling. Returns false if unavailable. */
export function openContactMethod(contact: Contact, method: ContactMethod): boolean {
  const href = methodHref(contact, method);
  if (!href) return false;
  if (method === "linkedin") {
    window.open(href, "_blank", "noopener,noreferrer");
  } else {
    // sms: / mailto: — navigate the current context so the OS/native app takes over.
    window.location.href = href;
  }
  return true;
}
