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
  initialFollowUpDays: 1 | 2 | 3;
  // Canonical manual cadence options: 3wk / 1mo / 6wk / 2mo / 3mo / 6mo.
  followUpCadenceDays: 21 | 30 | 42 | 60 | 90 | 180;
  // true = user manually chose the cadence; false = derived from priority.
  cadenceOverride: boolean;
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
  careerGoals: string[];
  goalTags: string[];
  hasSeenTutorial: boolean;
}
