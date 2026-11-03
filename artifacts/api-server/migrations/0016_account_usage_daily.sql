-- Per-account daily usage counts, so the limits in lib/usageLimits.ts survive
-- restarts and hold across API instances. Must exist BEFORE the API code that
-- uses it is deployed: without it, limited AI features use their non-AI
-- fallback and new news lookups stop.
--
-- Additive only. Holds counts, never content. A bucket can carry a contact's id,
-- so account deletion removes these rows.
CREATE TABLE IF NOT EXISTS account_usage_daily (
    user_id text NOT NULL,
    day     date NOT NULL,
    bucket  text NOT NULL,
    count   integer NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day, bucket)
);

CREATE INDEX IF NOT EXISTS account_usage_daily_day_idx ON account_usage_daily (day);
