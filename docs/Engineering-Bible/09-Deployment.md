# 09 — Deployment

See also: `diagrams/deployment.mmd`.

## Hosting summary

| Service | Platform | Type | Config source |
|---|---|---|---|
| `novara-mobile2` | Render | Web service (Node) | `render.yaml` |
| `novara-mobile2-frontend` | Render | Static site | `render.yaml` |
| Database | Neon | Serverless Postgres | `NEON_DATABASE_URL` (backend env) |
| Auth | Clerk | Managed identity platform | `CLERK_*` / `VITE_CLERK_*` env vars |
| Transactional email | Resend | Managed email API | `RESEND_API_KEY` |
| Push | Web Push protocol (VAPID) | Standards-based, no separate vendor | `VAPID_*` env vars |
| Source control / CI | GitHub | — | See caveat below |
| Mobile bundle | Expo Go (static bundle) | Not an app-store build | `artifacts/novara-mobile` |

## `render.yaml` — the source of truth for what's deployed

```yaml
services:
- type: web
  name: novara-mobile2
  env: node
  plan: starter
  buildCommand: pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build
  startCommand: pnpm --filter @workspace/api-server run start
  healthCheckPath: /api/healthz
  envVars: [NODE_ENV, DATABASE_URL, CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, GNEWS_API_KEY,
            VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, RESEND_API_KEY, FEEDBACK_TO_EMAIL]

- type: static
  name: novara-mobile2-frontend
  env: static
  buildCommand: pnpm install --frozen-lockfile && pnpm --filter @workspace/project-novara run build
  staticPublishPath: artifacts/project-novara/dist/public
  envVars: [VITE_API_BASE_URL, VITE_CLERK_PUBLISHABLE_KEY, VITE_CLERK_PROXY_URL]
```

Notable: `render.yaml` provisions `DATABASE_URL` for the backend, but `db.ts` (used by every route
at runtime) reads `NEON_DATABASE_URL` — see `03-Database.md` and `15-Known-Issues.md`. `plan:
starter` is Render's lowest paid tier for a web service (the pre-existing `PRODUCTION_CHECKLIST.md`
describes the live backend as being on Render's *free* tier at the time of that audit — whether
`starter` in this `render.yaml` reflects a since-completed upgrade, or the file simply not matching
what's actually provisioned in the Render dashboard, could not be confirmed from the repository
alone).

## Build

- **Backend:** `pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build`
  → `node build.mjs` → `esbuild`-bundled `dist/index.mjs` (ESM). Started with
  `pnpm --filter @workspace/api-server run start` → `node --enable-source-maps ./dist/index.mjs`.
- **Frontend:** `pnpm install --frozen-lockfile && pnpm --filter @workspace/project-novara run build`
  → `vite build` → static output at `artifacts/project-novara/dist/public`, published directly by
  Render's static-site hosting (no server process for the frontend).
- **Build-time env requirements:** the frontend build requires `PORT` and `BASE_PATH` to be set
  or `vite.config.ts` throws immediately (`"PORT environment variable is required..."` /
  `"BASE_PATH environment variable is required..."`).
- **Alternative build path (Replit):** `nixpacks.toml` at the repo root
  (`nixPkgs = ["nodejs_20", "python3", "gcc", "gnumake"]`, installs `pnpm@11.10.0` globally then
  runs `pnpm install --no-frozen-lockfile`) — this is Replit/Nixpacks-specific build configuration,
  separate from Render's own `buildCommand` in `render.yaml`. Its presence alongside `render.yaml`
  suggests the project has been deployed from more than one platform at different points (Replit
  for development/preview, Render for production).

## CI/CD — a caveat

The pre-existing `ARCHITECTURE.md`, `TEST_REPORT.md`, and `LAUNCH_READINESS_REPORT.md` in this
repository describe a GitHub Actions CI workflow at `.github/workflows/ci.yml`, running typecheck
and build on every push/PR to `main`, reported green as of commit `846aa31`. **No `.github`
directory exists anywhere in this working copy** — confirmed by a repo-wide search. Either this
working copy predates that CI workflow being added, or it was added directly on GitHub outside this
checkout. Regardless of which, **there is currently no CI configuration in this repository as
checked out**, and per those same docs, even when CI has existed, Render's auto-deploy from `main`
has never been gated by CI's pass/fail state — a red CI run does not block a bad deploy. See
`15-Known-Issues.md`.

## Deploy process (as configured)

Render's GitHub integration auto-deploys both services on every push to `main` — this is Render's
own platform behavior, not something configured in this repository's files beyond having the
services connected to the GitHub repo in Render's dashboard. There is no staging environment;
`render.yaml` and the two services above point at what appears to be a single production
environment.

## Rollback

Per `INCIDENT_RESPONSE.md`: revert the offending commit(s) on `main` and let auto-deploy redeploy
the reverted state, or use Render's dashboard to manually redeploy a previously-successful build if
one is still cached. No blue/green or canary deployment mechanism exists — a new deploy replaces
the running instance directly.

## Recovery

- **Backend down / degraded:** check `GET /api/healthz` first (`03-Database.md`,
  `04-API.md`) — it reports `databaseConnected` and any `missingEnvVars` directly.
- **Cold start:** if the backend is on a Render tier that sleeps after inactivity, the first
  request after idle can take 50+ seconds (documented in `INCIDENT_RESPONSE.md` as the single
  biggest reliability caveat found in the prior audit). This is expected behavior on a sleeping
  tier, not an incident.
- **Full incident runbook:** see `INCIDENT_RESPONSE.md` at the repo root — it is detailed,
  scenario-by-scenario, and this document does not duplicate it.

## Required secrets (names only — see `17-Configuration-Reference.md` for the full table)

Backend: `DATABASE_URL`/`NEON_DATABASE_URL` (see the naming caveat above), `CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`, `GNEWS_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `RESEND_API_KEY`.
Frontend (baked into the static bundle at build time — not secret once shipped):
`VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PROXY_URL`, `VITE_API_BASE_URL`.

## Mobile distribution

`artifacts/novara-mobile` is built (`scripts/build.js`) and served (`server/serve.js`) as a static,
pre-bundled Expo/Metro JS payload, opened through the Expo Go client app rather than a native
binary. It has no independent App Store/Play Store listing or review process — distribution is
"share a direct link, open in Expo Go." This is a deliberate, documented state (per
`ARCHITECTURE.md`), not an oversight, but it means mobile has none of the discoverability,
update-management, or platform-review benefits of a real app-store presence.
