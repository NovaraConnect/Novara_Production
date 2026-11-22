-- Native Android push (Firebase Cloud Messaging) device tokens.
--
-- A separate table, as apns_tokens is, so the iOS and Web Push tables are not
-- touched. Additive only: nothing reads this table unless FCM_SERVICE_ACCOUNT_B64
-- is configured, so it must exist before that variable is set.
CREATE TABLE IF NOT EXISTS fcm_tokens (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      text NOT NULL,
    device_token text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, device_token)
);

CREATE INDEX IF NOT EXISTS fcm_tokens_user_id_idx ON fcm_tokens (user_id);
