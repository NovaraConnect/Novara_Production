-- Records whether an Apple subscription period is the free trial.
--
-- Additive only: one nullable column on the `entitlements` table from 0004.
-- RevenueCat sends period_type (TRIAL, INTRO, NORMAL, PROMOTIONAL, PREPAID)
-- with every event; the app uses it to show "Free trial, N days left".
--
-- Numbered 0007 because feat/visual-refresh uses 0005 and 0006. Neither of
-- those touches this table, so the three can be applied in any order.
--
-- ORDER MATTERS: apply together with 0004, BEFORE deploying the API build that
-- contains it. The webhook writes this column and the status read selects it.

-- Hand-applied (no migration runner in this repo). Apply in a transaction.

BEGIN;

ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS period_type text NULL;

COMMIT;
