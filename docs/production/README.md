# Novara — Production Documentation

This folder is the production playbook for taking Novara from the MBA pilot to a
real production environment + App Store, **without touching the pilot**.

Read in this order:

1. **[ARCHITECTURE_PILOT_VS_PRODUCTION.md](ARCHITECTURE_PILOT_VS_PRODUCTION.md)** — the two-environment map and request flow.
2. **[READINESS_ASSESSMENT.md](READINESS_ASSESSMENT.md)** — honest ready/not-ready verdict + next actions.
3. **[DEPLOYMENT_PRODUCTION.md](DEPLOYMENT_PRODUCTION.md)** — step-by-step deploy (Neon → Clerk → backend → frontend → domains → mobile).
4. **[NEON_SETUP.md](NEON_SETUP.md)** — production database (new Neon branch) + schema apply.
5. **[CLERK_PRODUCTION_SETUP.md](CLERK_PRODUCTION_SETUP.md)** — production Clerk instance + domain.
6. **[RENDER_ENV_VARS.md](RENDER_ENV_VARS.md)** — exact env vars for both Render services.
7. **[DATA_MIGRATION.md](DATA_MIGRATION.md)** + **[sql/data_migration_DRAFT.sql](sql/data_migration_DRAFT.sql)** — pilot→prod data (draft, not executed).
8. **[TESTFLIGHT_APPSTORE.md](TESTFLIGHT_APPSTORE.md)** — Expo/EAS → TestFlight → App Store.
9. **[ROLLBACK_PLAN.md](ROLLBACK_PLAN.md)** — how to undo each step.
10. **[schema/production_schema.sql](schema/production_schema.sql)** — canonical, reproducible DB schema.

Environment templates live at the repo root: `.env.example`, `.env.pilot.example`, `.env.production.example`.

## Absolute rules honored here
- Pilot Render / Neon / Clerk are never modified.
- No secrets committed. No destructive DB commands. No data migrated without approval.
- All ⚠️ NEEDS APPROVAL steps wait for Cloe before touching any live external service.
