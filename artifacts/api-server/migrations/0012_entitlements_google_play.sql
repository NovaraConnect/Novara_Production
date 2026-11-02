-- Labels Google Play purchases as 'google_play', with one row per user, as
-- 'apple_iap' has for App Store purchases. Additive: existing Apple rows and the
-- 'apple_iap' index are untouched. Apply before deploying the API that uses it.

BEGIN;

ALTER TABLE entitlements DROP CONSTRAINT IF EXISTS entitlements_source_check;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_source_check
    CHECK (source IN ('apple_iap', 'google_play', 'university', 'stripe'));

CREATE UNIQUE INDEX IF NOT EXISTS entitlements_google_play_one_row
    ON entitlements (user_id) WHERE source = 'google_play';

-- Play purchases made before this migration were stored as 'apple_iap'. Only
-- Play product IDs contain a colon (…pro:monthly); App Store IDs never do.
UPDATE entitlements
   SET source = 'google_play', updated_at = now()
 WHERE source = 'apple_iap' AND product_id LIKE '%:%';

COMMIT;
