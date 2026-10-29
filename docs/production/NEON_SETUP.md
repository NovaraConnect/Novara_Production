# Neon — Production Database Setup

> ## ⚠️ THE LIVE DATABASE IS THE `production` BRANCH OF THE NEON PROJECT "novara restore"
>
> **Verified 2026-10-29**, when migration `0011_contact_marked_contacted_at.sql`
> was applied.
>
> | Neon project | Branch | ID | Status |
> |---|---|---|---|
> | **novara restore** (`long-sun-85238559`, created 2026-10-26) | **`production`** | `br-cool-waterfall-b4n0gtja` | ✅ **LIVE**: this is what `novara-prod-api` writes to |
> | novara restore | `local-test-add-page`, `api-tests-throwaway`, `restore_test` | | Test branches. Never migrate these for production. |
>
> The production data was restored into a new Neon project on 2026-10-26. The
> older project, with its `production_clean` (`br-old-band-atl4jpg9`) and stale
> `production` (`br-wandering-poetry-at9cqdyx`) branches, no longer appears in
> the Neon account. Earlier notes that call `production_clean` the live branch
> are out of date.
>
> **How it was identified.** It is the only project in the account. Its
> `production` branch has all 9 tables, including `apns_tokens` (migration 0002)
> and `company_news_cache` (migration 0003), holds a real APNs device token, and
> had a contact edited by the app the same morning. The Render `DATABASE_URL`
> itself was not read.
>
> **Before running ANY migration, verify the actual production connection.
> Never trust a branch name.** On 2026-09-19 migration
> `0003_company_news_cache.sql` was applied to the wrong branch by mistake; it
> was only caught because the API kept logging `company_news_cache table is
> missing` afterwards.
>
> Recommended check before migrating:
> 1. Compare the host in `novara-prod-api`'s `DATABASE_URL` (Render → Environment)
>    with the branch's endpoint host in Neon. They must match.
> 2. On that branch, run `SELECT to_regclass('public.apns_tokens') IS NOT NULL;`.
>    It must return `t`.
> 3. After migrating, confirm the Render API logs show no "table is missing" or
>    "column is missing" warnings.
>
> **Do not delete any branch** without checking with Cloé first.


Goal: a production database fully isolated from the pilot, created without any
change to the pilot database. Chosen approach: a **Neon branch** named `production`.

## Why a branch (recommended)
- Instant, isolated copy-on-write; same Neon project & billing.
- The pilot branch is never modified.
- Easy to reset/re-create the production data without risk.
- (Alternative: a separate Neon *project* for hard billing/blast-radius separation — more setup. Choose this only if you need independent billing.)

## Steps  ⚠️ NEEDS APPROVAL before running against the live Neon account
1. Neon Console → the Novara project → **Branches** → **New branch**.
   - Name: `production`. Parent: the current pilot branch (or `main`/default).
   - This gives you a full schema copy. Since it also copies **pilot data**, either:
     - (a) start from an **empty** branch and apply the schema file yourself, or
     - (b) branch from parent, then **truncate** the copied tables in the `production` branch only (safe — it's an isolated branch), then migrate selected data deliberately.
   - Recommended: **(a) empty + apply schema** for a truly clean production dataset.
2. Create a dedicated role/password for production (don't reuse pilot creds).
3. Copy the **pooled** connection string (`…-pooler.neon.tech`, `?sslmode=require`). Use the pooled one for Render.
4. Apply the schema:
   ```bash
   psql "$PROD_DATABASE_URL" -f docs/production/schema/production_schema.sql
   ```
5. Sanity check:
   ```bash
   psql "$PROD_DATABASE_URL" -c "\dt"                     # contacts, feedback, push_subscriptions, user_settings
   psql "$PROD_DATABASE_URL" -c "SELECT count(*) FROM contacts;"  # 0 on a clean start
   ```
6. Put the pooled URL into the backend's `DATABASE_URL` (see `RENDER_ENV_VARS.md`).

## Notes
- `db.ts` reads `DATABASE_URL` first, then `NEON_DATABASE_URL`. Set `DATABASE_URL`.
- Keep the pilot connection string out of the production service entirely.
- Backups: enable Neon PITR/history retention on the production branch before real users arrive.
