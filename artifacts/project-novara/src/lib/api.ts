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

// ── LinkedIn import ──────────────────────────────────────────────────────────

interface LinkedInImportResult {
  firstName?: string;
  lastName?: string;
  company?: string;
  role?: string;
  linkedinUrl?: string;
  parsedFromSlug?: boolean;
}

export async function importFromLinkedIn(
  getToken: GetAuthToken,
  url: string,
): Promise<LinkedInImportResult> {
  const res = await apiFetch(getToken, "/api/linkedin/import", {
    method: "POST",
    json: { url },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Import failed");
  }
  return res.json();
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
