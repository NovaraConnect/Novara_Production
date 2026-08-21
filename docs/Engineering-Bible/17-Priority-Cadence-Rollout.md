# 17 — Priority/Cadence Fix: Migration & Production Rollout

This documents the one-time steps required to ship the canonical priority/cadence system
(`@workspace/novara-priority`) and the `cadence_override` column to the production
`NovaraConnect/Novara-Mobile2` service on Render.

## What changed (summary)

- New shared package `lib/novara-priority` is the single source of truth for AI Suggested
  Priority and AI Suggested Cadence. Backend, web, and mobile all import it.
- New DB column `contacts.cadence_override boolean NOT NULL DEFAULT false`.
- New endpoint `POST /api/contacts/recalculate` (authenticated, idempotent).
- Career-goal recalculation is now synchronous and reported.

## Migration

**File:** `artifacts/api-server/migrations/0001_add_cadence_override.sql`

```sql
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS cadence_override boolean NOT NULL DEFAULT false;
```

Properties:

- **Idempotent** — `ADD COLUMN IF NOT EXISTS`; safe to run more than once.
- **Non-destructive** — no data dropped or rewritten. Existing rows default to `false`
  (automatic cadence), which matches prior behaviour.
- The app has **no migrations framework** (see `03-Database.md` / `ARCHITECTURE.md`), so this is
  applied by hand against the production database — it is not run automatically on deploy.

## Production rollout order (must be followed)

1. **Merge & deploy code first.** The backend tolerates the column being absent only for reads it
   never makes before migration; to be safe, apply the migration in the same maintenance window as
   the deploy. Deploy the branch to Render (web service `novara-mobile2` + static frontend).
2. **Apply the migration** against the production `DATABASE_URL` during the window:
   `psql "$DATABASE_URL" -f artifacts/api-server/migrations/0001_add_cadence_override.sql`
   (Do **not** run any production SQL until explicitly approved.)
3. **Backfill stale priorities/cadences.** Existing contacts still hold values from the old
   bump/drop algorithm. For each affected user, trigger a recompute — either by calling the
   authenticated `POST /api/contacts/recalculate` as that user, or by having the user save their
   career profile once (which now recalculates synchronously). This step is idempotent and skips
   all `priority_override` / `cadence_override` contacts.
4. **Verify** `GNEWS_API_KEY` is set on the Render web service (it is declared in `render.yaml`
   with `sync: false`; confirm a value exists in the dashboard). If missing, company-news now
   reports `config_missing` distinctly instead of "no news found."

## Rollback

- Code: redeploy the previous commit.
- Column: the column is additive and harmless; it does not need to be dropped on rollback. If
  desired, `ALTER TABLE contacts DROP COLUMN IF EXISTS cadence_override;` (destructive of the
  override flag only — not recommended unless necessary).

## Verification checklist

- [ ] `cadence_override` column present on `contacts`.
- [ ] Carla Petrone (`516e03cd-…`) recomputes to **High** (Sales at Estée Lauder), cadence **21**.
- [ ] A `priority_override = true` contact is unchanged by recalculation.
- [ ] A `cadence_override = true` contact keeps its manual cadence after a career-goal change.
- [ ] Company-news shows distinct states (headlines / empty / error / config-missing / timeout /
      stale), never collapsing failures into "no news found."
