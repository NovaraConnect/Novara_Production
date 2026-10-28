-- Auto-downgrade now offers 9, 12 or 18 months, or Never. Never is stored as
-- NULL (no downgrade at all: contacts always stay on their own cadence) and is
-- the default. The 3 and 6 month choices are gone.
--
-- Moves EVERY existing user to Never, including anyone who had picked 9 or 12,
-- as agreed for this change. Contacts already on the maintenance cadence keep
-- their current next follow-up date until the user next marks them contacted
-- or edits them; from then on the date follows their own cadence.
--
-- ORDER MATTERS: apply BEFORE deploying the API (and web) build that offers
-- Never. That build saves NULL, which the old NOT NULL column rejects. The old
-- API still running meanwhile reads NULL as 6 months, so in the gap between
-- this migration and the deploy, users keep today's behaviour.

-- Hand-applied (no migration runner in this repo). Apply in a transaction.

BEGIN;

ALTER TABLE user_settings ALTER COLUMN auto_downgrade_after_months DROP NOT NULL;
ALTER TABLE user_settings ALTER COLUMN auto_downgrade_after_months SET DEFAULT NULL;
UPDATE user_settings SET auto_downgrade_after_months = NULL, updated_at = NOW()
 WHERE auto_downgrade_after_months IS NOT NULL;

COMMIT;
