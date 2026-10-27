-- Reverses 0007_entitlements_period_type.sql.
--
-- Only run after the API that reads `period_type` has been rolled back.
-- Losing the column only loses the trial / paid distinction; access is unchanged.

BEGIN;
ALTER TABLE entitlements DROP COLUMN IF EXISTS period_type;
COMMIT;
