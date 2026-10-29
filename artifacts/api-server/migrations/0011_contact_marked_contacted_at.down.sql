-- Reverses 0011_contact_marked_contacted_at.sql. Safe at any time: the API
-- falls back to comparing dates when the column is missing.
ALTER TABLE contacts DROP COLUMN IF EXISTS marked_contacted_at;
