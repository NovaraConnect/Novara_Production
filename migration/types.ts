// ── Core domain types ─────────────────────────────────────────────────────────

export interface Contact {
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
  initialFollowUpDays: 1 | 2 | 3 | 5 | 7 | 14;
  followUpCadenceDays: 14 | 30 | 60 | 90;
  goalTags: string[];
  connectionStatus: "connected" | "pipeline";
  firstContactDate: string;
  lastInteractionDate: string;
  nextFollowUpDate: string;
  notes?: string;
  createdAt: string;
}

export interface UserSettings {
  autoDowngradeAfterMonths: 3 | 6 | 9 | 12;
  careerStatement: string;
  goalTags: string[];
  careerGoals: string[];
  hasSeenTutorial: boolean;
}

// ── Priority ──────────────────────────────────────────────────────────────────

export type PriorityLevel = "High" | "Medium" | "Low";

export type ImportanceLevel = "High" | "Medium" | "Low";

export type ConnectionStatus = "connected" | "pipeline";

// ── Cadence ───────────────────────────────────────────────────────────────────

export type InitialFollowUpDays = 1 | 2 | 3 | 5 | 7 | 14;

export type FollowUpCadenceDays = 14 | 30 | 60 | 90;

// ── API response shapes ───────────────────────────────────────────────────────

export interface LinkedInImportResult {
  firstName?: string;
  lastName?: string;
  company?: string;
  role?: string;
  linkedinUrl?: string;
  parsedFromSlug?: boolean;
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
  fetchedAt: string;
  fromCache: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

// ── Form input shapes ─────────────────────────────────────────────────────────

export type CreateContactInput = Omit<
  Contact,
  "id" | "createdAt" | "firstContactDate" | "lastInteractionDate" | "nextFollowUpDate"
>;

export type UpdateContactInput = Partial<Contact>;
