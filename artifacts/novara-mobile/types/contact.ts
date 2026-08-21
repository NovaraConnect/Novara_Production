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
  initialFollowUpDays: 1 | 2 | 3 | 5 | 7 | 14;
  // Superset of the canonical options (21/30/42/60/90/180) plus the legacy 14
  // value still present in older mobile fixtures. Cadence is derived from the
  // shared mapping via suggestFollowUpDays().
  followUpCadenceDays: 14 | 21 | 30 | 42 | 60 | 90 | 180;
  goalTags: string[];
  connectionStatus: "connected" | "pipeline";
  lastInteractionDate: string;
  nextFollowUpDate: string;
  notes?: string;
  createdAt: string;
}

export type RelationshipStatus = "Warm" | "Cooling" | "Cold";
