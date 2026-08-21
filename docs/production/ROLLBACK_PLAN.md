# Rollback Plan

Principle: the **pilot is the safety net**. Nothing in the production rollout
modifies pilot infra or data, so "roll back" = stop using production and keep
directing users to the pilot until fixed.

## Backend (Render `novara-prod-api`)
- Render keeps every deploy. **Rollback** = Render dashboard → the service → Deploys → pick the last-good deploy → **Rollback**.
- Because auto-deploy starts OFF, a bad commit on `production` can't reach users until you manually deploy — so most "rollbacks" are just "don't deploy it".

## Frontend (Render `novara-prod-web`)
- Same: redeploy the previous build. Remember `VITE_*` values are baked in — if you changed one, rebuild from the previous commit.

## Database (Neon production branch)
- Neon keeps history; use **PITR / restore** to a timestamp before a bad change.
- Data migration is additive and never writes to pilot, so worst case: **truncate the production tables and re-run** the migration. Pilot data is untouched and re-exportable.
- Always dry-run migrations on a throwaway Neon branch first.

## Clerk
- Production and dev instances are independent. If production auth misbehaves, users can't sign into production, but the pilot (dev instance) is unaffected.

## Domains
- If a custom domain misroutes, revert the app's env (`FRONTEND_URL`, `VITE_*`) to the `*.onrender.com` URLs and redeploy; DNS can be repointed without touching pilot.

## Mobile
- TestFlight builds are additive; expire a bad build and push a new one (bump `buildNumber`). The pilot Expo Go link keeps working independently.

## "Break glass" summary
1. Stop manual production deploys.
2. Roll back the offending Render service to last-good.
3. If data is wrong: Neon PITR or truncate+re-migrate (pilot is the source).
4. Point pilot users back to the pilot URL. Communicate. Diagnose. Retry.
