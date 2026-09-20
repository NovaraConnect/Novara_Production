# Neon — Production Database Setup

> ## ⚠️ THE LIVE BRANCH IS `production_clean`, NOT `production`
>
> **Verified 2026-09-19 against the running production API.**
>
> | Neon branch | ID | Status |
> |---|---|---|
> | **`production_clean`** | `br-old-band-atl4jpg9` | ✅ **LIVE** — this is what `novara-prod-api` connects to |
> | `production` | `br-wandering-poetry-at9cqdyx` | ❌ **STALE** — flagged "Default" in the Neon UI, but unused |
>
> The plan below says to create a branch named `production`. That is **not**
> what ended up being used. The branch name and Neon's "Default" flag are both
> actively misleading here.
>
> **How to tell them apart without guessing:**
> - `production_clean` has **6 tables** including `apns_tokens` (migration 0002)
>   and `company_news_cache` (migration 0003), and holds real APNs device tokens.
> - `production` has **4 tables**, no `apns_tokens`, and no live data.
>
> **Before running ANY migration, verify the actual production connection —
> never trust the branch name.** On 2026-09-19 migration
> `0003_company_news_cache.sql` was applied to `production` by mistake; it was
> only caught because the API kept logging
> `company_news_cache table is missing` afterwards.
>
> Recommended check before migrating:
> 1. In the Neon SQL Editor, confirm the branch selector reads `production_clean`.
> 2. Run `SELECT to_regclass('public.apns_tokens') IS NOT NULL;` — must be `t`.
> 3. After migrating, confirm the Render API logs stop reporting the table as missing.
>
> An empty, unused `company_news_cache` table remains on the stale `production`
> branch from that mistake. It is harmless and is deliberately being left in
> place for now. **Do not delete either branch.**


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
