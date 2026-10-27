-- Provider-neutral entitlements, first written for Apple In-App Purchase
-- through RevenueCat, plus the event log that makes RevenueCat webhooks
-- idempotent.
--
-- Additive only: creates two new tables and changes no existing table.
--
-- ORDER MATTERS: contact creation reads `entitlements` on every request
-- (lib/entitlements.ts). Apply this migration BEFORE deploying the API build
-- that contains it. Creating empty tables changes no behaviour for users.

-- Hand-applied (no migration runner in this repo). Apply in a transaction.
--
-- University branch note: feat/university-access also defines a table named
-- `entitlements` in its own 0004 file. That file must be renumbered to 0005
-- and changed to ALTER this table (see docs/APPLE_IAP_SETUP.md, "Rebasing the
-- university branch"). The `source` CHECK below already allows 'university'.

BEGIN;

CREATE TABLE IF NOT EXISTS entitlements (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Clerk user ID. Also the RevenueCat app_user_id for Apple purchases.
    user_id      text NOT NULL,
    source       text NOT NULL CHECK (source IN ('apple_iap', 'university', 'stripe')),
    -- Provider reference, e.g. RevenueCat original_transaction_id. Diagnostic only.
    provider_ref text NULL,
    product_id   text NULL,
    status       text NOT NULL CHECK (status IN ('active', 'inactive')),
    -- Apple's expiration. Access also requires expires_at > now() at read time,
    -- so a row whose status was never updated cannot grant access after expiry.
    expires_at   timestamptz NULL,
    -- event_timestamp of the newest provider event applied. Older events are ignored.
    last_event_at timestamptz NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- One Apple row per user: the novara_pro entitlement for Apple purchases.
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_apple_one_row
    ON entitlements (user_id) WHERE source = 'apple_iap';
CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements (user_id);

-- Every RevenueCat webhook event we have accepted. The primary key makes a
-- redelivered event a no-op. Rows are kept so duplicates can be audited.
CREATE TABLE IF NOT EXISTS revenuecat_events (
    event_id        text PRIMARY KEY,
    event_type      text NOT NULL,
    app_user_id     text NOT NULL,
    environment     text NULL,
    event_timestamp timestamptz NOT NULL,
    received_at     timestamptz NOT NULL DEFAULT now()
);

COMMIT;
