import { RelationshipStatus } from "@/types/contact";
import { computeSuggestedPriority, deriveSuggestedCadence } from "@workspace/novara-priority";

export function daysBetween(dateStr: string): number {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = now.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function computeStatus(lastInteractionDate: string): RelationshipStatus {
  const days = daysBetween(lastInteractionDate);
  if (days <= 30) return "Warm";
  if (days <= 90) return "Cooling";
  return "Cold";
}

export function computeHealthScore(contacts: { lastInteractionDate: string }[]): number {
  if (contacts.length === 0) return 0;
  const total = contacts.reduce((sum, c) => {
    const status = computeStatus(c.lastInteractionDate);
    if (status === "Warm") return sum + 100;
    if (status === "Cooling") return sum + 60;
    return sum + 20;
  }, 0);
  return Math.round(total / contacts.length);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function isOverdue(nextFollowUpDate: string): boolean {
  return new Date(nextFollowUpDate) <= new Date();
}

export function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Priority now comes from the ONE canonical source of truth; the old
// GENERIC_HIGH_* heuristic has been removed. Signature is preserved so mobile
// screens don't need to change.
export function suggestImportance(
  role: string,
  company: string,
  goalTags: string[],
  careerStatement: string
): { importance: "High" | "Medium" | "Low"; reason: string } {
  const importance = computeSuggestedPriority(
    { role, company, goalTags },
    { careerStatement, goalTags },
  );
  const reason =
    importance === "High"
      ? "Strong match with your target role and company"
      : importance === "Medium"
        ? "Partial match with your career goals"
        : "No strong overlap with your career goals";
  return { importance, reason };
}

const RECRUITER_KEYWORDS = ["recruiter", "recruiting", "talent", "hiring", "hr", "headhunter"];
const EVENT_KEYWORDS = ["conference", "event", "meetup", "summit", "alumni", "networking", "mixer", "hackathon", "workshop"];
const ONLINE_KEYWORDS = ["linkedin", "twitter", "dm", "email", "online", "cold", "outreach", "referral"];

export function suggestInitialFollowUp(
  role: string,
  metAt: string,
  importance: "High" | "Medium" | "Low"
): { days: 1 | 2 | 3 | 5 | 7 | 14; reason: string } {
  const roleL = normalizeText(role);
  const metAtL = normalizeText(metAt);

  const isRecruiter = RECRUITER_KEYWORDS.some((k) => roleL.includes(k));
  const isOnline = ONLINE_KEYWORDS.some((k) => metAtL.includes(k));
  const isEvent = EVENT_KEYWORDS.some((k) => metAtL.includes(k));

  if (isRecruiter) {
    return { days: 2, reason: "Recruiters move fast — reach out within 2 days" };
  }
  if (isOnline) {
    return { days: 1, reason: "You initiated online — follow up next day to keep momentum" };
  }
  if (isEvent && importance === "High") {
    return { days: 3, reason: "Strike while the event is fresh — within 3 days" };
  }
  if (isEvent) {
    return { days: 5, reason: "Follow up within a week of the event" };
  }
  if (importance === "High") {
    return { days: 3, reason: "High-priority contact — reach out within 3 days" };
  }
  if (importance === "Medium") {
    return { days: 5, reason: "Reach out within a week to stay warm" };
  }
  return { days: 7, reason: "A week gives both of you time to settle" };
}

// Cadence derives ONLY from priority, via the canonical mapping (21/42/90).
export function suggestFollowUpDays(
  importance: "High" | "Medium" | "Low",
  _contactGoalTags: string[] = [],
  _userGoalTags: string[] = []
): 21 | 42 | 90 {
  return deriveSuggestedCadence(importance);
}

export function careerFitScore(contactGoalTags: string[], userGoalTags: string[]): number {
  if (!userGoalTags.length || !contactGoalTags.length) return 0;
  const matches = contactGoalTags.filter((t) => userGoalTags.includes(t)).length;
  return Math.round((matches / userGoalTags.length) * 100);
}
