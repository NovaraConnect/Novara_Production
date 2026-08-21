import Constants from "expo-constants";

function getApiBase(): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const base = extra?.apiBaseUrl;
  if (typeof base === "string" && base) return base;
  return "http://localhost:3000";
}

export interface LinkedInImportResult {
  firstName?: string;
  lastName?: string;
  role?: string;
  company?: string;
  location?: string;
  linkedinUrl?: string;
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

export async function importFromLinkedIn(url: string): Promise<LinkedInImportResult> {
  const base = getApiBase();
  const response = await fetch(`${base}/api/linkedin/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Server error ${response.status}`);
  }

  return response.json() as Promise<LinkedInImportResult>;
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
