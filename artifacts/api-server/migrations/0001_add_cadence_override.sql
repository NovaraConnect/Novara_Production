-- ============================================================================
-- Migration 0001 — add contacts.cadence_override
--
-- Adds the persisted flag that distinguishes an automatic (priority-derived)
-- cadence from a user-chosen manual cadence.
--
--   • Idempotent: ADD COLUMN IF NOT EXISTS + guarded default.
--   • Non-destructive: no data is dropped or rewritten. Existing rows default
--     to FALSE (automatic cadence), which is the correct prior behaviour.
--   • The app has no migrations framework (see ARCHITECTURE.md); apply this
--     file manually against the production database — see the rollout plan in
--     docs. AFTER applying, run POST /api/contacts/recalculate (or update the
--     career profile) so follow_up_cadence_days is realigned to the canonical
--     mapping for every non-overridden contact.
-- ============================================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS cadence_override boolean NOT NULL DEFAULT false;
