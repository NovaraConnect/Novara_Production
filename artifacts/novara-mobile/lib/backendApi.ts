import { authedFetch, GetToken } from "@/lib/api";
import { Contact } from "@/types/contact";

/**
 * Backend contact DTO — the exact shape returned by the API (dbToContact on the
 * server; identical to the web app's Contact type). Mobile maps a subset of this
 * into its own `Contact` view model. See docs/production/MOBILE_DATA_LAYER.md.
 */
export interface ApiContact {
  id: string;
  firstName: string;
  lastName: string;
  linkedinUrl?: string;
  email?: string;
  phone?: string;
  company: string;
  role?: string;
  metAt?: string;
  importance: "High" | "Medium" | "Low";
  basePriority: "High" | "Medium" | "Low";
  currentPriority: "High" | "Medium" | "Low";
  priorityOverride: boolean;
  industry?: string;
  function?: string;
  interests: string[];
  initialFollowUpDays: number;
  followUpCadenceDays: number;
  cadenceOverride: boolean;
  goalTags: string[];
  connectionStatus: "connected" | "pipeline";
  firstContactDate: string;
  lastInteractionDate: string;
  nextFollowUpDate: string;
  notes?: string;
  createdAt: string;
}

export interface ApiUserSettings {
  autoDowngradeAfterMonths: number;
  careerStatement: string;
  careerGoals: string[];
  goalTags: string[];
  hasSeenTutorial: boolean;
}

/** Map a backend DTO into the mobile Contact view model (drops unused fields). */
export function apiToContact(api: ApiContact): Contact {
  return {
    id: api.id,
    firstName: api.firstName,
    lastName: api.lastName,
    linkedinUrl: api.linkedinUrl,
    email: api.email,
    phone: api.phone,
    company: api.company,
    role: api.role,
    metAt: api.metAt,
    importance: api.importance, // base priority (user-chosen); see mapping doc note 1
    initialFollowUpDays: api.initialFollowUpDays,
    followUpCadenceDays: api.followUpCadenceDays,
    goalTags: api.goalTags ?? [],
    connectionStatus: api.connectionStatus,
    lastInteractionDate: api.lastInteractionDate,
    nextFollowUpDate: api.nextFollowUpDate,
    notes: api.notes,
    createdAt: api.createdAt,
  };
}

async function readJson<T>(res: Response, errorMsg: string): Promise<T> {
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(errorMsg);
  return (await res.json()) as T;
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export async function fetchContacts(getToken: GetToken): Promise<Contact[]> {
  const res = await authedFetch(getToken, "/api/contacts");
  const data = await readJson<ApiContact[]>(res, "Failed to fetch contacts");
  return data.map(apiToContact);
}

export type NewContactInput = Omit<
  Contact,
  "id" | "createdAt" | "lastInteractionDate" | "nextFollowUpDate"
>;

export async function createContact(
  getToken: GetToken,
  data: NewContactInput,
): Promise<Contact> {
  const res = await authedFetch(getToken, "/api/contacts", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const api = await readJson<ApiContact>(res, "Failed to create contact");
  return apiToContact(api);
}

export async function updateContact(
  getToken: GetToken,
  id: string,
  updates: Partial<Contact>,
): Promise<Contact> {
  const res = await authedFetch(getToken, `/api/contacts/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
  const api = await readJson<ApiContact>(res, "Failed to update contact");
  return apiToContact(api);
}

export async function deleteContact(getToken: GetToken, id: string): Promise<void> {
  const res = await authedFetch(getToken, `/api/contacts/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete contact");
}

export async function markContactedToday(getToken: GetToken, id: string): Promise<Contact> {
  const res = await authedFetch(getToken, `/api/contacts/${id}/mark-contacted`, {
    method: "POST",
  });
  const api = await readJson<ApiContact>(res, "Failed to mark contact");
  return apiToContact(api);
}

/** Bulk import (used by the one-time local→backend migration). Idempotent server-side. */
export async function importContacts(
  getToken: GetToken,
  contacts: object[],
): Promise<{ imported: number; skipped: number }> {
  const res = await authedFetch(getToken, "/api/contacts/import", {
    method: "POST",
    body: JSON.stringify({ contacts }),
  });
  return readJson<{ imported: number; skipped: number }>(res, "Import failed");
}

// ── Settings (mobile profile) ────────────────────────────────────────────────

export async function fetchSettings(getToken: GetToken): Promise<ApiUserSettings> {
  const res = await authedFetch(getToken, "/api/settings");
  return readJson<ApiUserSettings>(res, "Failed to fetch settings");
}

export async function saveSettings(
  getToken: GetToken,
  settings: Partial<ApiUserSettings>,
): Promise<ApiUserSettings> {
  const res = await authedFetch(getToken, "/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
  return readJson<ApiUserSettings>(res, "Failed to save settings");
}
