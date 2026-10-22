// The Novara Free contact ceiling, and the one rule for lifting it.
// An active university entitlement removes the ceiling. The server enforces the
// same rule; this keeps the UI from blocking an entitled user early.
export const FREE_CONTACT_LIMIT = 6;

export function contactLimit(universityActive: boolean): number {
  return universityActive ? Number.POSITIVE_INFINITY : FREE_CONTACT_LIMIT;
}
