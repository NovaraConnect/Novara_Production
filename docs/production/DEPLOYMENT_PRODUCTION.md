# Production Deployment Plan

Order matters: **Neon → Clerk → Backend → Frontend → Domains → Mobile.** Each step
is independent of the pilot. Nothing here touches pilot services. Steps that hit a
live external account are marked ⚠️ NEEDS APPROVAL — do not run without Cloe's go-ahead.

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
