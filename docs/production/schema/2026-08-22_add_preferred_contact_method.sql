-- Migration: add an optional preferred contact method to contacts.
-- Values: 'text' | 'email' | 'linkedin' | NULL (no preference).
-- Additive, non-destructive, idempotent. Existing rows default to NULL.
-- Run against the PRODUCTION Neon database only. Do NOT run on the pilot DB.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS preferred_contact_method text;
