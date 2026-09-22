// ============================================================================
// The two dates a user can now set on a contact: when they met, and when they
// last spoke.
//
// Until these were editable, every contact was recorded as met — and spoken
// to — on the day it was added. Someone met two years ago and never followed
// up therefore arrived "Warm", which is the opposite of what Novara exists to
// surface.
//
// The next follow-up is derived from those dates with the SAME rule that
// POST /contacts/:id/mark-contacted applies, so the two paths cannot disagree:
//
//   never spoken since meeting → met + the first reach-out delay
//   spoken since               → last spoke + cadence, or MAINTENANCE_DAYS once
//                                the relationship is older than the user's
//                                auto-downgrade threshold
//
// All arithmetic is on "YYYY-MM-DD" strings at UTC midnight. The API process
// and Postgres both run in UTC, so this agrees with CURRENT_DATE.
// ============================================================================

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const EARLIEST_DATE = "1900-01-01";

/** Mirrors the 180-day interval mark-contacted uses in maintenance mode. */
export const MAINTENANCE_DAYS = 180;

/** "YYYY-MM-DD" for a UTC instant. */
export function utcDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return utcDateString(new Date(toUtcMs(date) + days * DAY_MS));
}

function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** A real calendar date in YYYY-MM-DD form. "2026-02-30" is rejected. */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const ms = toUtcMs(value);
  return !Number.isNaN(ms) && utcDateString(new Date(ms)) === value;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export type ResolvedContactDates =
  | { ok: true; firstContactDate: string; lastInteractionDate: string }
  | { ok: false; error: string };

/**
 * Validates the user's dates and fills in whatever they left out.
 *
 * `current` is the stored pair when editing, absent when creating.
 *
 * - first omitted       → the stored value, or today for a new contact
 * - last `undefined`    → the stored value, or the met date for a new contact
 * - last `null` / `""`  → the met date: "haven't spoken since we met"
 *
 * Future dates allow one day of slack past UTC today, so someone east of UTC
 * can still enter their own local today.
 */
export function resolveContactDates(input: {
  first?: unknown;
  last?: unknown;
  current?: { first: string; last: string };
  today?: string;
}): ResolvedContactDates {
  const today = input.today ?? utcDateString();
  const latestAllowed = addDays(today, 1);

  const first = isBlank(input.first) ? (input.current?.first ?? today) : input.first;
  if (!isValidDateString(first)) {
    return { ok: false, error: "The date you met must be a real date (YYYY-MM-DD)." };
  }

  let last: unknown;
  if (input.last === undefined) last = input.current?.last ?? first;
  else if (isBlank(input.last)) last = first;
  else last = input.last;
  if (!isValidDateString(last)) {
    return { ok: false, error: "The date you last spoke must be a real date (YYYY-MM-DD)." };
  }

  // Leaving the stored dates as they are always succeeds. Older rows can hold
  // a pair these rules would reject (the import path never checked ordering),
  // and an edit to someone's notes must not start failing because of it.
  if (input.current && first === input.current.first && last === input.current.last) {
    return { ok: true, firstContactDate: first, lastInteractionDate: last };
  }

  if (first > latestAllowed || last > latestAllowed) {
    return { ok: false, error: "Dates can't be in the future." };
  }
  if (first < EARLIEST_DATE) {
    return { ok: false, error: "The date you met is too far in the past." };
  }
  if (last < first) {
    return { ok: false, error: "The last time you spoke can't be before the day you met." };
  }
  return { ok: true, firstContactDate: first, lastInteractionDate: last };
}

/**
 * When to follow up next, given when the user met this person and last spoke
 * to them. The result may be in the past — that is the point: someone not
 * spoken to in a year should show as overdue, not as due in three weeks.
 */
export function computeNextFollowUp(input: {
  firstContactDate: string;
  lastInteractionDate: string;
  initialFollowUpDays: number;
  cadenceDays: number;
  downgradeMonths: number;
  today?: string;
}): string {
  const today = input.today ?? utcDateString();
  if (input.lastInteractionDate === input.firstContactDate) {
    return addDays(input.firstContactDate, input.initialFollowUpDays);
  }
  const maintenance = daysBetween(input.firstContactDate, today) >= input.downgradeMonths * 30;
  return addDays(input.lastInteractionDate, maintenance ? MAINTENANCE_DAYS : input.cadenceDays);
}
