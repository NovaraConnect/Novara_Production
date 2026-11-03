-- Per-user, per-calendar-month AI spend, so the monthly cap survives restarts
-- and deploys. lib/aiBudget.ts reads and writes this on every AI call and turns
-- AI off (non-AI fallbacks only) if it can't, so this table must exist BEFORE
-- the API code that uses it is deployed.
--
-- Additive only. Holds no prompts, notes, or AI output: a cost and a count.
CREATE TABLE IF NOT EXISTS ai_usage_monthly (
    user_id      text NOT NULL,
    month        date NOT NULL,
    spent_micros bigint NOT NULL DEFAULT 0,
    calls        integer NOT NULL DEFAULT 0,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, month)
);
