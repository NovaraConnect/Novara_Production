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
  data: Omit<Contact, "id" | "createdAt" | "updatedAt" | "firstContactDate" | "lastInteractionDate" | "nextFollowUpDate"> & {
    /** When they met. Omitted → today. */
    firstContactDate?: string;
    /** When they last spoke. Blank → not since they met. */
    lastInteractionDate?: string;
  },
): Promise<Contact> {
  const res = await apiFetch(getToken, "/api/contacts", {
    method: "POST",
    json: data,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { code?: string; message?: string };
    if (body.code === "CONTACT_LIMIT_REACHED") throw new Error("Contact limit reached");
    if (body.code === "SUBSCRIPTION_REQUIRED") throw new Error("Subscription required");
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

// ── Account ──────────────────────────────────────────────────────────────────

/**
 * Permanently deletes the signed-in user's contacts, settings, notification
 * registrations and login.
 *
 * Required by App Store Review Guideline 5.1.1(v) for any app that offers
 * account creation. Irreversible — every caller must confirm first.
 */
export async function deleteAccount(getToken: GetAuthToken): Promise<void> {
  const res = await apiFetch(getToken, "/api/account", { method: "DELETE" });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to delete your account. Please try again.");
  }
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
  /** Whether the native Novara Pro paywall may be shown (iOS shell only). Off
   *  until the App Store products, the RevenueCat webhook and the purchase
   *  build are all live. */
  applePaywall: boolean;
  /** Whether adding contacts needs Novara Pro or its free trial. Only ever on
   *  together with applePaywall. Off: Free keeps the 6-contact limit. */
  subscriptionRequired: boolean;
  /** Local development API only: simulator StoreKit test purchases may be
   *  reported to it. Always false on Render. */
  localStoreKitTest: boolean;
}

const FEATURES_CACHE_KEY = "novara.features.lastKnown";

/** The flags from the last successful /api/features call, if any.
 *
 *  Used when the API cannot be reached, so an outage does not silently strip
 *  working features out of the UI — which is exactly what happened when the
 *  database ran out of compute: every flag read as false and the LinkedIn
 *  importer disappeared from Add Contact, while the unflagged business-card
 *  scanner next to it kept working. */
export function readCachedFeatures(): Features | null {
  try {
    const raw = localStorage.getItem(FEATURES_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      aiEnrich: !!data?.aiEnrich,
      cardAiParse: !!data?.cardAiParse,
      linkedinAiParse: !!data?.linkedinAiParse,
      linkedinScreenshotImport: !!data?.linkedinScreenshotImport,
      applePaywall: !!data?.applePaywall,
      subscriptionRequired: !!data?.subscriptionRequired,
      localStoreKitTest: !!data?.localStoreKitTest,
    };
  } catch {
    return null;
  }
}

/** Non-secret capability flags.
 *
 *  THROWS when the flags cannot be fetched. It deliberately does not fall back
 *  to all-false: "we could not ask the server" is not the same answer as "the
 *  server said no", and callers need to tell them apart. A real `false` from a
 *  reachable server still turns a feature off, remotely and immediately. */
export async function fetchFeatures(getToken: GetAuthToken): Promise<Features> {
  const res = await apiFetch(getToken, "/api/features");
  if (!res.ok) throw new Error(`Failed to fetch features: ${res.status}`);

  const data = await res.json();
  const features: Features = {
    aiEnrich: !!data?.aiEnrich,
    cardAiParse: !!data?.cardAiParse,
    linkedinAiParse: !!data?.linkedinAiParse,
    linkedinScreenshotImport: !!data?.linkedinScreenshotImport,
    applePaywall: !!data?.applePaywall,
    subscriptionRequired: !!data?.subscriptionRequired,
    localStoreKitTest: !!data?.localStoreKitTest,
  };

  try {
    localStorage.setItem(FEATURES_CACHE_KEY, JSON.stringify(features));
  } catch {
    // Private mode or a full quota — the flags just will not survive a reload.
  }

  return features;
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

// ── Contact photos ───────────────────────────────────────────────────────────

async function contactFromResponse(res: Response, fallback: string): Promise<Contact> {
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? fallback);
  }
  return res.json();
}

/** Saves a photo (a small JPEG data URL, see lib/contactPhoto) for a contact. */
export async function setContactPhoto(getToken: GetAuthToken, id: string, photo: string): Promise<Contact> {
  const res = await apiFetch(getToken, `/api/contacts/${id}/photo`, { method: "PUT", json: { photo } });
  return contactFromResponse(res, "Couldn't save the photo. Please try again.");
}

/** Removes a contact's photo, back to initials. */
export async function removeContactPhoto(getToken: GetAuthToken, id: string): Promise<Contact> {
  const res = await apiFetch(getToken, `/api/contacts/${id}/photo`, { method: "DELETE" });
  return contactFromResponse(res, "Couldn't remove the photo. Please try again.");
}

// ── Network Health trend ─────────────────────────────────────────────────────

/** The score from about a month ago, or null until a month of history exists. */
export async function fetchHealthTrend(getToken: GetAuthToken): Promise<{ score: number; date: string } | null> {
  const res = await apiFetch(getToken, "/api/network-health/trend");
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { lastMonth?: { score: number; date: string } | null };
  return body.lastMonth ?? null;
}

// ── Subscription status ──────────────────────────────────────────────────────

/** Where the user stands: in the free trial, on a paid period, lapsed, or
 *  never subscribed. */
export type SubscriptionState = "trial" | "active" | "expired" | "none";

/** The server's view of the signed-in user's Novara Pro status. */
export interface ProStatus {
  /** True during the free trial and during a paid period. */
  pro: boolean;
  source: "apple_iap" | null;
  /** End of the current period (the trial end during a trial), or null when not Pro. */
  expiresAt: string | null;
  state: SubscriptionState;
  /** Monthly or annual. During a trial, the plan it turns into. */
  billingPeriod: "monthly" | "annual" | null;
  /** While Pro: true if it renews at expiresAt, false if cancelled (access
   *  ends at expiresAt), null if not known. Null when not Pro. */
  willRenew: boolean | null;
}

/** Throws on failure. Callers decide what an unknown status means for the UI;
 *  the server still enforces every limit regardless. */
export async function fetchProStatus(getToken: GetAuthToken): Promise<ProStatus> {
  const res = await apiFetch(getToken, "/api/entitlements/me");
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(`Failed to read subscription status: ${res.status}`);
  const data = await res.json();
  return {
    pro: data?.pro === true,
    source: data?.source === "apple_iap" ? "apple_iap" : null,
    expiresAt: typeof data?.expiresAt === "string" ? data.expiresAt : null,
    state: (["trial", "active", "expired", "none"] as const).find((s) => s === data?.state)
      // An API from before trials existed only reports `pro`.
      ?? (data?.pro === true ? "active" : "none"),
    billingPeriod: data?.billingPeriod === "monthly" || data?.billingPeriod === "annual" ? data.billingPeriod : null,
    willRenew: typeof data?.willRenew === "boolean" ? data.willRenew : null,
  };
}

/** Local testing only: tells a local API what the simulator's StoreKit test
 *  environment holds, in place of the RevenueCat webhook. The API refuses this
 *  everywhere except a developer's own machine. */
export async function reportLocalStoreKitEntitlement(
  getToken: GetAuthToken,
  entitlement: {
    active: boolean;
    productId: string | null;
    expiresAt: string | null;
    isTrial: boolean;
    willRenew?: boolean | null;
  },
): Promise<void> {
  const res = await apiFetch(getToken, "/api/dev/storekit-test/entitlement", {
    method: "POST",
    json: entitlement,
  });
  if (!res.ok) throw new Error(`Local StoreKit test report failed: ${res.status}`);
}
