import { Contact, UserSettings } from "@/types/contact";
import { differenceInDays, addDays } from "date-fns";
import { cadenceLabel } from "@workspace/novara-priority";

export const MAINTENANCE_DAYS = 180;

export function isInMaintenanceMode(
  contact: Contact,
  autoDowngradeAfterMonths: number = 6,
): boolean {
  const firstContact = new Date(contact.firstContactDate);
  const daysSince = differenceInDays(new Date(), firstContact);
  return daysSince >= autoDowngradeAfterMonths * 30;
}

export function getEffectiveCadenceDays(
  contact: Contact,
  autoDowngradeAfterMonths: number = 6,
): number {
  return isInMaintenanceMode(contact, autoDowngradeAfterMonths)
    ? MAINTENANCE_DAYS
    : contact.followUpCadenceDays;
}

export function computeNextFollowUpDate(
  lastInteractionDate: string,
  contact: Contact,
  autoDowngradeAfterMonths: number = 6,
): Date {
  const cadence = getEffectiveCadenceDays(contact, autoDowngradeAfterMonths);
  return addDays(new Date(lastInteractionDate), cadence);
}

export function formatCadenceLabel(
  contact: Contact,
  settings: UserSettings,
): string {
  if (isInMaintenanceMode(contact, settings.autoDowngradeAfterMonths)) {
    return "Maintenance: twice per year";
  }
  // Single source of truth for cadence labels (3wk / 1mo / 6wk / 2mo / 3mo / 6mo).
  return cadenceLabel(contact.followUpCadenceDays);
}
