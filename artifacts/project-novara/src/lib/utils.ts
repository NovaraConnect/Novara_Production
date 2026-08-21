import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { differenceInDays, format } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type RelationshipStatus = "Warm" | "Cooling" | "Cold" | "Dormant"

export function daysBetween(dateStr: string | null | undefined): number {
  if (!dateStr) return 9999;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 9999;
  return differenceInDays(new Date(), d);
}

// Relationship health is computed ONLY from a contact object's nextFollowUpDate.
// The legacy raw-date-string path has been removed — callers must pass the
// contact (or at least its nextFollowUpDate) so the overdue-based rules apply
// consistently everywhere.
//   • due today or in the future → Warm
//   • 1–30 days overdue          → Cooling
//   • 31–90 days overdue         → Cold
//   • more than 90 days overdue  → Dormant
export function computeStatus(contact: { nextFollowUpDate?: string | null }): RelationshipStatus {
  if (!contact.nextFollowUpDate) return "Cold";
  const daysPastDue = differenceInDays(new Date(), new Date(contact.nextFollowUpDate));
  if (daysPastDue <= 0) return "Warm";
  if (daysPastDue <= 30) return "Cooling";
  if (daysPastDue <= 90) return "Cold";
  return "Dormant";
}

export function getDaysPastDue(contact: { nextFollowUpDate?: string | null }): number {
  if (!contact.nextFollowUpDate) return 0;
  return Math.max(0, differenceInDays(new Date(), new Date(contact.nextFollowUpDate)));
}

export function computeHealthScore(contacts: { nextFollowUpDate?: string | null }[]): number {
  if (contacts.length === 0) return 0;
  const scores = contacts.map(c => {
    const status = computeStatus(c);
    if (status === "Warm") return 100;
    if (status === "Cooling") return 60;
    if (status === "Cold") return 20;
    return 0;
  });
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  try {
    return format(new Date(dateStr), "MMM d, yyyy");
  } catch {
    return "Never";
  }
}

export function statusColor(status: RelationshipStatus): string {
  switch (status) {
    case "Warm": return "text-emerald-600 bg-emerald-50 border-emerald-200";
    case "Cooling": return "text-yellow-600 bg-yellow-50 border-yellow-200";
    case "Cold": return "text-orange-600 bg-orange-50 border-orange-200";
    case "Dormant": return "text-red-600 bg-red-50 border-red-200";
  }
}

export function statusBorderColor(status: RelationshipStatus): string {
  switch (status) {
    case "Warm": return "border-l-emerald-400";
    case "Cooling": return "border-l-yellow-400";
    case "Cold": return "border-l-orange-400";
    case "Dormant": return "border-l-red-400";
  }
}