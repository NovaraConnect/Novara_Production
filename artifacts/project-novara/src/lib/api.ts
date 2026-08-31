import { API_BASE } from "./apiBase";
import { Contact, UserSettings } from "@/types/contact";

export type GetAuthToken = () => Promise<string | null>;

type ApiFetchOptions = RequestInit & {
  json?: unknown;
};

export async function apiFetch(
  getToken: GetAuthToken,
  path: string,
  { json, headers, ...init }: ApiFetchOptions = {},
): Promise<Response> {
  const token = await getToken();
  const requestHeaders = new Headers(headers);

  if (!token) {
    throw new Error("Unauthorized");
  }

  if (json !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  requestHeaders.set("Authorization", `Bearer ${token}`);

  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: requestHeaders,
    body: json !== undefined ? JSON.stringify(json) : init.body,
  });
}

// ── Company news ─────────────────────────────────────────────────────────────

export interface Headline {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
}

export interface CompanyNewsResult {
  company: string;
  headlines: Headline[];
  fetchedAt: string;
  fromCache: boolean;
}

export async function getCompanyNews(
  getToken: GetAuthToken,
  company: string,
): Promise<CompanyNewsResult> {
  const res = await apiFetch(getToken, `/api/company-news?company=${encodeURIComponent(company)}`);
  if (!res.ok) throw new Error("Failed to fetch news");
  return res.json();
}

// ── Contacts CRUD ────────────────────────────────────────────────────────────

export async function fetchContacts(getToken: GetAuthToken): Promise<Contact[]> {
  const res = await apiFetch(getToken, "/api/contacts");
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch contacts");
  return res.json();
}

export async function createContact(
  getToken: GetAuthToken,
  data: Omit<Contact, "id" | "createdAt" | "updatedAt" | "firstContactDate" | "lastInteractionDate" | "nextFollowUpDate">,
): Promise<Contact> {
  const res = await apiFetch(getToken, "/api/contacts", {
    method: "POST",
    json: data,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { code?: string; message?: string };
    if (body.code === "CONTACT_LIMIT_REACHED") throw new Error("Contact limit reached");
    throw new Error("Failed to create contact");
  }
  return res.json();
}

export async function updateContact(
  getToken: GetAuthToken,
  id: string,
  data: Partial<Contact>,
): Promise<Contact> {
  const res = await apiFetch(getToken, `/api/contacts/${id}`, {
    method: "PUT",
    json: data,
  });
  if (!res.ok) throw new Error("Failed to update contact");
  return res.json();
}

export async function deleteContact(getToken: GetAuthToken, id: string): Promise<void> {
  const res = await apiFetch(getToken, `/api/contacts/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete contact");
}

export async function markContactedToday(getToken: GetAuthToken, id: string): Promise<Contact> {
  const res = await apiFetch(getToken, `/api/contacts/${id}/mark-contacted`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to mark contact");
  return res.json();
}

export async function importContactsFromLocalStorage(
  getToken: GetAuthToken,
  contacts: object[],
): Promise<{ imported: number; skipped: number }> {
  const res = await apiFetch(getToken, "/api/contacts/import", {
    method: "POST",
    json: { contacts },
  });
  if (!res.ok) throw new Error("Import failed");
  return res.json();
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function fetchSettings(getToken: GetAuthToken): Promise<UserSettings> {
  const res = await apiFetch(getToken, "/api/settings");
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function saveSettings(
  getToken: GetAuthToken,
  settings: Partial<UserSettings>,
): Promise<UserSettings> {
  const res = await apiFetch(getToken, "/api/settings", {
    method: "PUT",
    json: settings,
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}

// ── Feedback / bug reports ───────────────────────────────────────────────────

export type FeedbackType = "bug" | "feature" | "general";

export interface FeedbackSubmission {
  type: FeedbackType;
  subject: string;
  description: string;
  contactEmail?: string;
  mayContact: boolean;
  pageUrl?: string;
  userAgent?: string;
  appVersion?: string;
}

export interface FeedbackResult {
  id: string;
  type: FeedbackType;
  subject: string;
  status: string;
  createdAt: string;
}

export async function submitFeedback(
  getToken: GetAuthToken,
  data: FeedbackSubmission,
): Promise<FeedbackResult> {
  const res = await apiFetch(getToken, "/api/feedback", {
    method: "POST",
    json: data,
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Failed to submit feedback");
  }
  return res.json();
}

// ── Feature flags ────────────────────────────────────────────────────────────

export interface Features {
  /** Whether optional AI contact enrichment is available in this deployment. */
  aiEnrich: boolean;
  /** Whether optional AI business-card text parsing is available. */
  cardAiParse: boolean;
  /** Whether optional AI LinkedIn-screenshot text parsing is available. */
  linkedinAiParse: boolean;
  /** Whether the LinkedIn screenshot importer is shown at all. */
  linkedinScreenshotImport: boolean;
}

/** Non-secret capability flags. Defaults everything off if the call fails, so
 *  the UI degrades gracefully (features stay hidden) rather than erroring. */
export async function fetchFeatures(getToken: GetAuthToken): Promise<Features> {
  try {
    const res = await apiFetch(getToken, "/api/features");
    if (!res.ok)
      return { aiEnrich: false, cardAiParse: false, linkedinAiParse: false, linkedinScreenshotImport: false };
    const data = await res.json();
    return {
      aiEnrich: !!data?.aiEnrich,
      cardAiParse: !!data?.cardAiParse,
      linkedinAiParse: !!data?.linkedinAiParse,
      linkedinScreenshotImport: !!data?.linkedinScreenshotImport,
    };
  } catch {
    return { aiEnrich: false, cardAiParse: false, linkedinAiParse: false, linkedinScreenshotImport: false };
  }
}

// ── Optional AI enrichment ───────────────────────────────────────────────────

export interface EnrichResult {
  enriched: boolean;
  inferred: { industry: string | null; function: string | null };
  contact: Contact;
}

/** Improve a contact's match by inferring industry/function from company+role.
 *  Throws a descriptive error when the feature is disabled (HTTP 503) so the
 *  caller can surface it — never required for any core flow. */
export async function enrichContact(
  getToken: GetAuthToken,
  id: string,
): Promise<EnrichResult> {
  const res = await apiFetch(getToken, `/api/contacts/${id}/enrich`, {
    method: "POST",
  });
  if (res.status === 503) {
    throw new Error("AI enrichment isn't enabled for this deployment.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Enrichment failed");
  }
  return res.json();
}
