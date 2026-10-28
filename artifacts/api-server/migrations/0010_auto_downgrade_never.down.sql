-- Reverses 0010_auto_downgrade_never.sql.
--
-- Users' choices from before 0010 were not kept, so everyone on Never goes
-- back to the old default of 6 months. Only run after rolling back the API.

BEGIN;
UPDATE user_settings SET auto_downgrade_after_months = 6, updated_at = NOW()
 WHERE auto_downgrade_after_months IS NULL;
ALTER TABLE user_settings ALTER COLUMN auto_downgrade_after_months SET DEFAULT 6;
ALTER TABLE user_settings ALTER COLUMN auto_downgrade_after_months SET NOT NULL;
COMMIT;
