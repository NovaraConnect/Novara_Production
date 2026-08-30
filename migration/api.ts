/**
 * Novara API layer for React Native / Expo
 *
 * Usage:
 *   1. Set API_BASE_URL to your deployed API server (e.g. https://novara-api.replit.app)
 *   2. Pass a `getToken` function — use `useAuth` from @clerk/clerk-expo:
 *        const { getToken } = useAuth();
 *        const contacts = await fetchContacts(getToken);
 */

import type {
  Contact,
  UserSettings,
  CreateContactInput,
  CompanyNewsResult,
  ImportResult,
} from "./types";

export const API_BASE_URL = "https://novara-api.replit.app"; // replace with your deployment URL

type GetToken = () => Promise<string | null>;

async function apiFetch(
  path: string,
  getToken: GetToken,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  return res;
}

// ── Company news ──────────────────────────────────────────────────────────────

export async function getCompanyNews(
  company: string,
  getToken: GetToken,
): Promise<CompanyNewsResult> {
  const res = await apiFetch(
    `/api/company-news?company=${encodeURIComponent(company)}`,
    getToken,
  );
  if (!res.ok) throw new Error("Failed to fetch news");
  return res.json();
}

// ── Contacts CRUD ─────────────────────────────────────────────────────────────

export async function fetchContacts(getToken: GetToken): Promise<Contact[]> {
  const res = await apiFetch("/api/contacts", getToken);
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch contacts");
  return res.json();
}

export async function createContact(
  data: CreateContactInput,
  getToken: GetToken,
): Promise<Contact> {
  const res = await apiFetch("/api/contacts", getToken, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { code?: string; message?: string };
    if (body.code === "CONTACT_LIMIT_REACHED") throw new Error("Contact limit reached");
    throw new Error("Failed to create contact");
  }
  return res.json();
}

export async function updateContact(
  id: string,
  data: Partial<Contact>,
  getToken: GetToken,
): Promise<Contact> {
  const res = await apiFetch(`/api/contacts/${id}`, getToken, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update contact");
  return res.json();
}

export async function deleteContact(id: string, getToken: GetToken): Promise<void> {
  const res = await apiFetch(`/api/contacts/${id}`, getToken, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete contact");
}

export async function markContactedToday(id: string, getToken: GetToken): Promise<Contact> {
  const res = await apiFetch(`/api/contacts/${id}/mark-contacted`, getToken, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to mark contact");
  return res.json();
}

export async function importContacts(
  contacts: object[],
  getToken: GetToken,
): Promise<ImportResult> {
  const res = await apiFetch("/api/contacts/import", getToken, {
    method: "POST",
    body: JSON.stringify({ contacts }),
  });
  if (!res.ok) throw new Error("Import failed");
  return res.json();
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function fetchSettings(getToken: GetToken): Promise<UserSettings> {
  const res = await apiFetch("/api/settings", getToken);
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function saveSettings(
  settings: Partial<UserSettings>,
  getToken: GetToken,
): Promise<UserSettings> {
  const res = await apiFetch("/api/settings", getToken, {
    method: "PUT",
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}
