-- AI spend across all users, per calendar month, for the total monthly cap.
-- lib/aiBudget.ts reads and writes this on every AI call and turns AI off
-- (non-AI fallbacks only) if it can't, so this table must exist BEFORE the API
-- code that uses it is deployed.
--
-- Additive only. Holds no user ids, prompts, notes, or AI output.
CREATE TABLE IF NOT EXISTS ai_usage_total_monthly (
    month        date PRIMARY KEY,
    spent_micros bigint NOT NULL DEFAULT 0,
    calls        integer NOT NULL DEFAULT 0,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Start from what the per-user rows already recorded.
INSERT INTO ai_usage_total_monthly (month, spent_micros, calls)
SELECT month, SUM(spent_micros), SUM(calls)
FROM ai_usage_monthly
GROUP BY month
ON CONFLICT (month) DO NOTHING;
