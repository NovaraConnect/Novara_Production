-- Native iOS push (APNs) device tokens.
--
-- Deliberately a separate table from push_subscriptions rather than widening
-- it: that table's p256dh/auth are NOT NULL and meaningless for APNs, so
-- reusing it would mean altering a live table for no benefit. Additive only —
-- nothing reads this table unless the APNS_* env vars are configured.
--
-- `environment` distinguishes the two APNs hosts. TestFlight and App Store
-- builds mint production tokens; a build run from Xcode mints sandbox tokens.
-- A token sent to the wrong host fails with BadDeviceToken, so it is stored
-- per token rather than assumed globally.
CREATE TABLE IF NOT EXISTS apns_tokens (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      text NOT NULL,
    device_token text NOT NULL,
    environment  text NOT NULL DEFAULT 'production',
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, device_token)
);

CREATE INDEX IF NOT EXISTS apns_tokens_user_id_idx ON apns_tokens (user_id);
