-- Reverses 0014_ai_usage_monthly.sql. Roll the API back first: with the table
-- gone, lib/aiBudget.ts refuses every AI call and users get the fallbacks only.
DROP TABLE IF EXISTS ai_usage_monthly;
