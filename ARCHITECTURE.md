# Architecture

Novara is a personal-CRM style app for tracking professional contacts and follow-ups. It's a
pnpm monorepo with three deployable artifacts and a handful of internal/dev-only packages.

## Components

**`artifacts/api-server`** — Node/Express API, deployed as the Render web service
`Novara-Mobile2-2` (free tier). Owns all business logic and is the only component with direct
database access. Talks to: Neon Postgres (`NEON_DATABASE_URL`), Clerk (auth), GNews.io (news
feature), and the Web Push protocol (VAPID-signed notifications, optional/feature-gated).

**`artifacts/project-novara`** — React/Vite web frontend, deployed as the Render static site
`novara-mobile2-frontend`. This is the actual production web app users interact with in a
browser (despite the folder name suggesting otherwise — `novara-mobile` is a separate, Expo-based
mobile artifact). Talks only to the API server and to Clerk's frontend SDK (proxied through the
backend via `VITE_CLERK_PROXY_URL`).

**`artifacts/novara-mobile`** — Expo/React Native app, built as a static Expo Go deployment
(bundled JS served over HTTP, opened via the Expo Go client app rather than a native binary).
Not published to the App Store or Play Store — see the mobile readiness section below.

**`artifacts/mockup-sandbox`** — Internal Replit dev-preview tool. Not referenced anywhere in
`render.yaml`; not part of the deployed product. Its build requires `PORT`/`BASE_PATH` to be set,
which is why CI needs placeholder values for it that production never needed.

**`scripts`, root-level libs** — shared build/typecheck tooling, no runtime footprint.

## Request flow (web)

1. Browser loads the static `project-novara` bundle from Render's static-site CDN.
2. Clerk's frontend SDK handles sign-in, proxied through the API server at a configured path
   (`CLERK_PROXY_PATH` / `clerkProxyMiddleware`) rather than talking to Clerk directly — this
   keeps Clerk's dashboard-configured domain aligned with the backend's own domain.
3. Authenticated API calls go to the api-server's `/api/*` routes with a Clerk session token.
   `clerkMiddleware` (server-side) attaches auth state to the request; individual routes call
   `requireAuth` to enforce it and read `req.userId`.
4. Route handlers query Postgres directly via a single shared `pg.Pool` (`db.ts`), scoping every
   query by `user_id` (verified this session across `contacts.ts`, `settings.ts`,
   `notifications.ts` — see the multi-tenancy note below).
5. CORS is enforced via an explicit origin allowlist in `app.ts` (added this session — previously
   `origin: true`, i.e. any origin was allowed with credentials, which was a real cross-origin
   auth risk).

## Request flow (mobile)

The mobile client is served as static, pre-bundled JS (Metro/Expo's production bundle, built once
at deploy time, not a live dev server) and opened through the Expo Go app. It talks to the same
api-server over HTTPS. Because it's Expo Go rather than a native build, it has no independent App
Store/Play Store distribution — anyone using it needs the Expo Go client and a direct link, and
it inherits Expo Go's own platform constraints (no custom native modules, Expo Go's own version
compatibility window, etc.).

## Auth

Clerk is the identity provider for both the web and mobile clients. Two Clerk instances existed
at the start of this engagement (`coherent-lionfish-59` on the frontend, `smooth-bedbug-72` on
the backend) — a live, silent 401 bug, since a session issued by one instance is meaningless to
the other. Fixed by aligning both to the same instance and adding `authorizedParties` to the
backend's `clerkMiddleware` config so it only accepts tokens issued for the known frontend origin.

## Data layer

Single Postgres database (Neon, serverless Postgres). No read replicas, no connection pooling
service in front of Neon beyond the `pg.Pool` inside the API process itself, no migrations
framework was located in the audited tree (schema changes appear to be applied by hand or through
a separate `migration/` directory not exercised by CI). Tables observed: `contacts`,
`user_settings`, `push_subscriptions`, `notifications`-adjacent tables — all scoped by `user_id`
in every query path reviewed.

## Background jobs

A single in-process `node-cron` job (`scheduler.ts`), running daily at 09:00 UTC inside the
api-server process itself (not a separate worker or queue). It scans all users with
`push_enabled = true`, computes due/overdue/status-change notifications, and sends Web Push
messages. Entirely disabled (with a log warning, not a crash) if VAPID keys are absent. Because
this runs inside the same process as the HTTP server, a Render free-tier cold-start or restart
will delay or skip that day's notification run until the process is next warm at or after 09:00
UTC — this is a real scheduling-reliability gap on the free tier specifically.

## Deployment topology

- **Render** hosts all three deployable services, split across 6 visible services in the Render
  project, of which 4 appear to be stale/duplicate/orphaned (not referenced by the current
  `render.yaml`, one already suspended). Flagged for cleanup but not touched — see
  `PRODUCTION_CHECKLIST.md`.
- The live backend (`Novara-Mobile2-2`) is on Render's **free tier**, which spins down after
  inactivity and cold-starts in 50+ seconds. This is the single biggest reliability caveat for
  anything described as "launch."
- Builds on Render use `nixpacks.toml` (`nodejs_20`, `pnpm@11.10.0` installed via `npm install -g`)
  — this is a different Node major version than CI now uses (Node 22, required because pnpm 11.x
  needs Node ≥22.13 to run at all). Production's install currently succeeds despite this (verified
  via live Render deploy logs this session), likely because Render's build cache preserves pnpm's
  build-script approval state across builds in a way a fresh GitHub Actions runner never has. This
  discrepancy is unresolved and worth production-side attention — it currently works, but the
  underlying cause isn't fully understood, only worked around in CI.
- No staging environment was found; `render.yaml` and the visible Render services all point at
  what appears to be a single production environment.

## CI/CD

`.github/workflows/ci.yml`, added this session, runs on every push/PR to `main`: install, pnpm
build-script approval (a first-run-only step required by pnpm 11's default script-blocking
security behavior), typecheck across all TypeScript packages, and a full `pnpm run build` across
all 9 buildable workspace projects. This is the first CI this repository has ever had. It does not
run tests, because none exist (see `TEST_REPORT.md`). It does not deploy — Render's own
GitHub-integration auto-deploy on push handles that, independently of CI's pass/fail status
(CI failing does not currently block a Render deploy).
