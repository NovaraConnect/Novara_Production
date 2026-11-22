-- Reverses 0012_entitlements_google_play.sql. Play rows go back to 'apple_iap',
-- where the previous API looks for them. A user who also has an Apple row keeps
-- only that one, because 'apple_iap' allows one row per user.

BEGIN;

DELETE FROM entitlements g
 WHERE g.source = 'google_play'
   AND EXISTS (SELECT 1 FROM entitlements a WHERE a.user_id = g.user_id AND a.source = 'apple_iap');

UPDATE entitlements SET source = 'apple_iap', updated_at = now() WHERE source = 'google_play';

DROP INDEX IF EXISTS entitlements_google_play_one_row;

ALTER TABLE entitlements DROP CONSTRAINT IF EXISTS entitlements_source_check;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_source_check
    CHECK (source IN ('apple_iap', 'university', 'stripe'));

COMMIT;
