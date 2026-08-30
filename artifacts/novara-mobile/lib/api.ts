import Constants from "expo-constants";

function getApiBase(): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const base = extra?.apiBaseUrl;
  if (typeof base === "string" && base) return base;
  return "http://localhost:3000";
}

export interface Headline {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
}

export interface CompanyNewsResult {
  company: string;
  headlines: Headline[];
  fetchedAt: number;
  fromCache?: boolean;
  stale?: boolean;
}


export async function getCompanyNews(company: string): Promise<CompanyNewsResult> {
  const base = getApiBase();
  const response = await fetch(
    `${base}/api/company-news?company=${encodeURIComponent(company)}`,
    {
      headers: { Accept: "application/json" },
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Server error ${response.status}`);
  }

  return response.json() as Promise<CompanyNewsResult>;
}

/**
 * A function that returns the current auth token, e.g. Clerk's
 * useAuth().getToken. Returns null when there is no active session.
 */
export type GetToken = () => Promise<string | null>;

/**
 * fetch() wrapper that attaches the Clerk session token as
 * `Authorization: Bearer <token>`. Pass Clerk's `getToken` from useAuth().
 * Throws "Unauthorized" when there is no active session so callers can react.
 *
 * NOTE: this is the auth-aware transport only. Wiring the existing data calls
 * (contacts/settings/news/linkedin) through it is a deliberate later step —
 * see artifacts/novara-mobile/CLERK_AUTH_PLAN.md.
 */
export async function authedFetch(
  getToken: GetToken,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getToken();
  if (!token) {
    throw new Error("Unauthorized: no active session");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${getApiBase()}${path}`, { ...init, headers });
}
