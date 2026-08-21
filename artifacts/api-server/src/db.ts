import pg from "pg";
import { normalizePriority } from "./lib/priority";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL,
});

export type Contact = {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  linkedin_url: string | null;
  email: string | null;
  phone: string | null;
  company: string;
  role: string | null;
  met_at: string | null;
  importance: string;
  base_priority: string;
  current_priority: string;
  priority_override: boolean;
  industry: string | null;
  function: string | null;
  interests: string[];
  initial_follow_up_days: number;
  follow_up_cadence_days: number;
  cadence_override: boolean;
  goal_tags: string[];
  connection_status: string;
  first_contact_date: Date;
  last_interaction_date: Date;
  next_follow_up_date: Date;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

function toDateStr(val: Date | string): string {
  return typeof val === "string" ? val.split("T")[0] : val.toISOString().split("T")[0];
}

export function dbToContact(row: Contact) {
  const base = normalizePriority(row.base_priority ?? row.importance);
  const current = normalizePriority(row.current_priority ?? row.base_priority ?? row.importance);
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    linkedinUrl: row.linkedin_url ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    company: row.company,
    role: row.role ?? undefined,
    metAt: row.met_at ?? undefined,
    importance: base,
    basePriority: base,
    currentPriority: current,
    priorityOverride: row.priority_override ?? false,
    industry: row.industry ?? undefined,
    function: row.function ?? undefined,
    interests: row.interests ?? [],
    initialFollowUpDays: row.initial_follow_up_days,
    followUpCadenceDays: row.follow_up_cadence_days,
    cadenceOverride: row.cadence_override ?? false,
    goalTags: row.goal_tags ?? [],
    connectionStatus: (row.connection_status ?? "connected") as "connected" | "pipeline",
    firstContactDate: toDateStr(row.first_contact_date),
    lastInteractionDate: toDateStr(row.last_interaction_date),
    nextFollowUpDate: toDateStr(row.next_follow_up_date),
    notes: row.notes ?? undefined,
    createdAt: typeof row.created_at === "string"
      ? row.created_at
      : (row.created_at as Date).toISOString(),
  };
}
