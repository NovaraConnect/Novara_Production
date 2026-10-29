# Production Deployment Plan

Order matters: **Neon → Clerk → Backend → Frontend → Domains → Mobile.** Each step
is independent of the pilot. Nothing here touches pilot services. Steps that hit a
live external account are marked ⚠️ NEEDS APPROVAL — do not run without Cloe's go-ahead.

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

## 0. GitHub (branch model)
- Create branch `production` from this clean branch. Keep `main` as pilot.
- Protect `production` (no force-push; require the CI check).
- `render.yaml` in `production` describes the NEW services only (see below).

## 1. Neon — production database  ⚠️ NEEDS APPROVAL
See `NEON_SETUP.md`. Summary: create a **`production` branch** in the Neon project,
grab its **pooled** connection string, apply `schema/production_schema.sql`.

## 2. Clerk — production instance  ⚠️ NEEDS APPROVAL
See `CLERK_PRODUCTION_SETUP.md`. Summary: create a Production instance, set the
custom domain, copy `pk_live_`/`sk_live_`, configure allowed origins.

## 3. Backend — new Render web service  ⚠️ NEEDS APPROVAL
- New Web Service from the `production` branch.
- Build: `pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build`
- Start: `pnpm --filter @workspace/api-server run start`
- Health check path: `/api/healthz`
- Plan: **Starter or higher** (never free — cold starts break the notification cron).
- Auto-Deploy: **OFF initially** (deploy manually until production is proven), then optionally ON for `production` only.
  - **Current state (2026-10-29):** auto-deploy is still **OFF** for `novara-prod-api`, so every API change needs **Manual Deploy → Deploy latest commit** after it merges. `novara-prod-web` auto-deploys from `main`.
- Env vars: the BACKEND block of `.env.production.example` / `RENDER_ENV_VARS.md`.
- Suggested name: `novara-prod-api`.

## 4. Frontend — new Render static site  ⚠️ NEEDS APPROVAL
- New Static Site from the `production` branch.
- Build: `pnpm install --frozen-lockfile && pnpm --filter @workspace/project-novara run build`
- Publish dir: `artifacts/project-novara/dist/public`
- Env vars: the FRONTEND block (`VITE_*`). Remember these bake into the bundle at build time — rebuild after any change.
- Suggested name: `novara-prod-web`.

## 5. Custom domains  ⚠️ NEEDS APPROVAL
- Backend: `api.novaraconnect.group` → the Render backend (CNAME per Render's instructions).
- Frontend: `app.novaraconnect.group` → the Render static site.
- After DNS verifies, set `FRONTEND_URL`, `VITE_API_BASE_URL`, `VITE_CLERK_PROXY_URL` to the custom domains and redeploy. Add both origins to Clerk allowed origins.

## 6. Mobile (Expo → TestFlight/App Store)
See `TESTFLIGHT_APPSTORE.md`. Point `EXPO_PUBLIC_API_BASE_URL` at `https://api.novaraconnect.group`.

## Verify commands (local)
```bash
pnpm install                                   # first time; approve build scripts if prompted
pnpm run typecheck                             # all packages
pnpm --filter @workspace/api-server run build  # backend esbuild bundle
pnpm --filter @workspace/api-server run test   # backend tests (Linux/CI or local Linux)
# Frontend vite build runs on Linux (Render/CI) — rollup native binaries are excluded for the deploy target.
```

## Post-deploy smoke test (production)
1. `GET https://api.novaraconnect.group/api/healthz` → `{status:"ok", databaseConnected:true}` with no `missingEnvVars`.
2. Load `https://app.novaraconnect.group`, sign up a fresh user (Clerk prod), add a contact, reload — contact persists.
3. `GET /api/company-news?...` without a token → **401** (auth gate working).
4. Trigger a feedback submit → row in `feedback`, email delivered (if Resend configured).
