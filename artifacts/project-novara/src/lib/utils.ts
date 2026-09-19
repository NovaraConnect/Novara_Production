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

// ---------------------------------------------------------------------------
// Semantic status styling.
//
// Warm / Cooling / Cold / Dormant carry MEANING, not decoration, so their
// colours live as design tokens (see --warm, --cooling, --cold, --dormant in
// index.css) and are referenced here rather than spelled out per component.
// Changing a hue is a one-line change in the token; the mapping of hue to
// meaning must not change at all.
// ---------------------------------------------------------------------------

/** Tinted pill: bright readable text on a dark translucent wash. */
export function statusColor(status: RelationshipStatus): string {
  switch (status) {
    case "Warm": return "text-warm bg-warm-soft border-warm/25";
    case "Cooling": return "text-cooling bg-cooling-soft border-cooling/25";
    case "Cold": return "text-cold bg-cold-soft border-cold/25";
    case "Dormant": return "text-dormant bg-dormant-soft border-dormant/25";
  }
}

/**
 * The coloured edge on a contact card — the fastest status read in the app.
 *
 * Uses the -accent tokens, not the text ones. The stripe sits beside a badge
 * that spells the status out, so it is a reinforcement rather than the only
 * signal, and does not have to meet the contrast floor that text does. On the
 * light theme that is the difference between a gold stripe and a yellow one:
 * any yellow dark enough to read as text is gold or olive.
 */
export function statusBorderColor(status: RelationshipStatus): string {
  switch (status) {
    case "Warm": return "border-l-warm-accent";
    case "Cooling": return "border-l-cooling-accent";
    case "Cold": return "border-l-cold-accent";
    case "Dormant": return "border-l-dormant-accent";
  }
}

/** Foreground-only, for a status dot or an icon. */
export function statusTextColor(status: RelationshipStatus): string {
  switch (status) {
    case "Warm": return "text-warm";
    case "Cooling": return "text-cooling";
    case "Cold": return "text-cold";
    case "Dormant": return "text-dormant";
  }
}

/** Background-only, for the status tiles on the Dashboard. */
export function statusSoftBg(status: RelationshipStatus): string {
  switch (status) {
    case "Warm": return "bg-warm-soft";
    case "Cooling": return "bg-cooling-soft";
    case "Cold": return "bg-cold-soft";
    case "Dormant": return "bg-dormant-soft";
  }
}