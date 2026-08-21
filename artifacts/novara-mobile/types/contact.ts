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
  // Widened to number: the backend stores/returns arbitrary integer day counts
  // (cadence is derived from priority server-side). The add/edit screens still
  // present a fixed set of options. See docs/production/MOBILE_DATA_LAYER.md.
  initialFollowUpDays: number;
  followUpCadenceDays: number;
  goalTags: string[];
  connectionStatus: "connected" | "pipeline";
  lastInteractionDate: string;
  nextFollowUpDate: string;
  notes?: string;
  createdAt: string;
}

export type RelationshipStatus = "Warm" | "Cooling" | "Cold";
