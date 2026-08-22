# Deployment & rollback notes — Contact actions (PR #2)

Feature: optional **preferred contact method** + **"Contact now"** action.
Changes are additive and reversible.

## Rollout order (do NOT skip step 2)
1. **Final real-app verification** — done (component-level source verification; see PR discussion).
2. **Run the Neon PRODUCTION migration** (owner runs/approves — Claude never touches the connection string):
   ```sql
   ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS preferred_contact_method text;
   ```
3. **Confirm the column exists** (`\d contacts`, or `SELECT preferred_contact_method FROM contacts LIMIT 1;`).
4. **Merge PR #2**, then deploy: `novara-prod-web` (frontend) auto-deploys on the `main` merge; `novara-prod-api` (backend) needs a manual **Deploy latest commit**.

## Migration safety
- **Additive & nullable:** adds `preferred_contact_method text` — no `NOT NULL`, no default. No existing column or row is altered. Nothing to backfill.
- **Existing rows = NULL = "no preference":** backend maps `NULL → undefined`; the segmented control shows **None**; "Contact now" offers whatever methods the contact actually has.
- **Current production app keeps working after the migration but before the code deploy:** the live code's INSERT/UPDATE don't reference the new column, and `SELECT *` harmlessly ignores it.

## Rollback / reversibility
1. **Code/UI problem after deploy:** revert PR #2 (`git revert` the merge commit → push → redeploy) **or** use Render's **Rollback** to redeploy the previous deploy for both `novara-prod-api` and `novara-prod-web`. Fast and reversible.
2. **The column stays:** because the migration is additive/nullable, leaving `preferred_contact_method` in place after a code rollback is safe — the previous app version simply ignores it.
3. **Do NOT drop the column during an emergency rollback** unless we explicitly decide to later (dropping is a separate, deliberate migration — not part of rollback).
4. **Confirmed:** the current production app works after the migration but before the code deploy.
5. **Confirmed:** existing contacts with `NULL` `preferred_contact_method` behave as "no preference".

## Not touched
Pilot services, Neon secrets/connection strings, Clerk, DNS, Apple — none touched by this change.
