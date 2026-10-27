-- Reverses 0009_entitlements_will_renew.sql.
--
-- Only run after the API that reads `will_renew` has been rolled back.
-- Losing the column only loses the "Cancelled · access until …" wording;
-- access is unchanged.

BEGIN;
ALTER TABLE entitlements DROP COLUMN IF EXISTS will_renew;
COMMIT;
