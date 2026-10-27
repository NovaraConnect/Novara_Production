-- Records whether an Apple subscription will renew (auto-renew on) or has
-- been cancelled and will end at expires_at.
--
-- Additive only: one nullable column on the `entitlements` table from 0004.
-- NULL means not known yet (rows written before this column existed, or
-- events that don't say). The app then keeps its usual wording.
--
-- Numbered 0009 because feat/visual-refresh uses 0005, 0006 and 0008, and
-- this branch uses 0007. None of those touch this column, so they can be
-- applied in any order after 0004.
--
-- ORDER MATTERS: apply BEFORE deploying the API build that contains it. The
-- webhook writes this column and the status read selects it.

-- Hand-applied (no migration runner in this repo). Apply in a transaction.

BEGIN;

ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS will_renew boolean NULL;

COMMIT;
