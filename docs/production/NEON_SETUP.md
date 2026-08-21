# Neon — Production Database Setup

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
