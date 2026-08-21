# 02 — System Architecture

See also: `diagrams/architecture.mmd` (component diagram) and `diagrams/deployment.mmd`
(deployment topology).

## The monorepo

Novara is a single pnpm workspace (`pnpm-workspace.yaml`) containing multiple deployable
artifacts and shared internal libraries. Workspace packages, per `pnpm-workspace.yaml`:

```
packages:
  - artifacts/*
  - lib/*
  - lib/integrations/*   # glob present in config; no lib/integrations directory currently exists
  - scripts
```

### Deployable artifacts (`artifacts/`)

| Package | Role | Deployed as | Framework |
|---|---|---|---|
| `api-server` | The one and only backend. Owns all business logic and the only component with direct database access. | Render web service `novara-mobile2` (per `render.yaml`) | Express 5, Node (ESM), `esbuild` bundle |
| `project-novara` | The production web app — despite the "novara-mobile" naming elsewhere in the repo, **this** is the actual browser-based product users interact with. | Render static site `novara-mobile2-frontend` | React 19 + Vite 7, installable PWA |
| `novara-mobile` | A separate Expo/React Native client. | Static Expo Go bundle (see `09-Deployment.md`) — not a native App Store/Play Store build | Expo ~54, React Native, Expo Router |
| `mockup-sandbox` | Internal design-preview tool. Not referenced in `render.yaml`; not part of the deployed product. | Not deployed | Vite + React, same shadcn/Radix component set as `project-novara` |

### Internal libraries (`lib/`)

| Package | Role |
|---|---|
| `db` (`@workspace/db`) | Drizzle ORM schema + migration generator. **Important:** only the `feedback` table is actually defined here (`lib/db/src/schema/feedback.ts`). This package is used for `drizzle-kit generate`/`push` and is *not* imported anywhere in `artifacts/api-server`'s runtime code — confirmed by repo-wide grep for `@workspace/db` imports, which returns none inside `artifacts/api-server/src`. |
| `api-spec` (`@workspace/api-spec`) | An OpenAPI 3.1 spec (`openapi.yaml`) plus an Orval codegen config. As of this writing, the spec documents only the `/healthz` endpoint — it is not a complete contract for the API described in `04-API.md`. |
| `api-zod` (`@workspace/api-zod`) | Zod schemas generated from `api-spec` by Orval. Mirrors the spec's limited coverage (only a `healthStatus` type exists under `src/generated/types`). |
| `api-client-react` (`@workspace/api-client-react`) | TanStack Query hooks generated from the same spec, for the same limited surface. |
| `scripts` | Shared workspace-level scripts package (currently just a placeholder `hello.ts`). |

### `migration/` (repo root, not a workspace package)

A standalone set of files (`api.ts`, `auth.ts`, `constants.ts`, `hooks.ts`, `queryClient.ts`,
`schemas.ts`, `types.ts`) implementing an API client for "Novara API layer for React Native /
Expo," per the header comment in `migration/api.ts`. It is **not** listed in
`pnpm-workspace.yaml`'s `packages` glob, so it is not built, typechecked, or otherwise part of the
live workspace — it reads as either a reference implementation being migrated into
`artifacts/novara-mobile`, or a leftover from before the monorepo consolidation. Its own comments
reference `https://novara-api.replit.app` as a placeholder API base URL, consistent with a
pre-Render, Replit-hosted phase of the project.

## Request flow (web) — see `diagrams/api-sequence.mmd`

1. The browser loads the static `project-novara` bundle from Render's static-site hosting.
2. Sign-in/sign-up is handled by Clerk's React SDK (`@clerk/react`), configured in `App.tsx`.
   Clerk's Frontend API calls are proxied through the backend at `/api/__clerk`
   (`VITE_CLERK_PROXY_URL` → `clerkProxyMiddleware` in `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`)
   so Clerk's dashboard-configured domain stays aligned with the backend's own domain rather than
   requiring separate CNAME DNS configuration.
3. Authenticated API calls attach a Clerk session token as a Bearer token
   (`apiFetch` in `artifacts/project-novara/src/lib/api.ts`, `Authorization: Bearer <token>`).
4. On the backend, `clerkMiddleware` (mounted in `app.ts`) attaches auth state to every request;
   individual routes call `requireAuth` (`middlewares/auth.ts`) to enforce a valid session and
   populate `req.userId` from the verified Clerk session — **never from anything client-supplied**.
5. Route handlers query Postgres directly through a single shared `pg.Pool`
   (`artifacts/api-server/src/db.ts`), scoping every contacts/settings/notifications query by
   `user_id` from the verified session.

## Request flow (mobile)

`novara-mobile` is served as a pre-bundled Expo/Metro JS bundle (built once at deploy time, not a
live dev server) and opened through the Expo Go client app. It talks to the same `api-server` over
HTTPS, using its own `lib/api.ts` client (separate from, but conceptually parallel to, the web
frontend's `lib/api.ts`).

## Data layer

A single Postgres database (Neon, serverless Postgres) — see `03-Database.md` for the full schema.
There is no read replica, no connection-pooling layer beyond the single in-process `pg.Pool`, and
(as of this working copy) no migrations framework covering the `contacts`, `user_settings`, and
`push_subscriptions` tables — only `feedback` has a Drizzle-generated migration
(`lib/db/drizzle/0000_steep_the_captain.sql`). The other three tables' shape is documented
directly in `artifacts/api-server/tests/schema.sql`, whose own header comment states plainly:
"This is NOT a migrations framework (the app has none in production either) — it exists solely to
give the test Postgres service container something real to talk to." Schema changes to those
tables appear to be applied by hand.

There is also a connection-string naming inconsistency worth flagging here (see `15-Known-Issues.md`
for the full detail): `artifacts/api-server/src/db.ts` (used by every route at runtime) reads
`process.env.NEON_DATABASE_URL`, while `lib/db/src/index.ts` (the Drizzle package, used only for
migrations) reads `process.env.DATABASE_URL`, and `render.yaml` only provisions `DATABASE_URL`.

## Background jobs

A single in-process `node-cron` job (`artifacts/api-server/src/lib/scheduler.ts`), scheduled for
09:00 UTC daily, running inside the same Node process as the HTTP server — not a separate worker
or queue. It scans every user with `push_enabled = true`, computes due/overdue/status-change
notifications per user, and sends Web Push messages via `lib/push.ts`. If either `VAPID_PUBLIC_KEY`
or `VAPID_PRIVATE_KEY` is unset, `startScheduler()` logs a warning and the job never registers —
no crash. Because the cron job lives in-process, any restart or (on a sleeping-tier host) cold
start that happens to coincide with 09:00 UTC will delay or entirely skip that day's run, with no
backfill logic.

## External integrations

| Integration | Used for | Where | Failure mode if unconfigured |
|---|---|---|---|
| Clerk | Authentication (frontend + backend), proxied through the backend | `app.ts`, `middlewares/clerkProxyMiddleware.ts`, `App.tsx` | App cannot authenticate anyone |
| Neon Postgres | Primary datastore | `db.ts` (`NEON_DATABASE_URL`) | `/api/healthz` reports `databaseConnected: false`; most routes 500 |
| GNews.io | Company news headlines for a contact | `routes/news.ts` (`GNEWS_API_KEY`) | Route degrades gracefully, returns `{ headlines: [] }` with an error message rather than crashing |
| Resend | Feedback-notification emails | `lib/email.ts` (`RESEND_API_KEY`) | Feedback still saved to DB; email send is skipped with a warning log |
| Web Push (VAPID) | Browser push notifications | `lib/push.ts`, `sw.ts` | Notification feature silently disabled |
| LinkedIn (unauthenticated scraping) | Pre-filling a new contact from a LinkedIn profile URL | `routes/linkedin.ts` | Route returns a 502/422 with a user-facing "try again or fill in manually" message |

## Deployment topology

See `09-Deployment.md` and `diagrams/deployment.mmd` for the full breakdown of Render services,
build commands, and environment wiring.

## A note on architectural honesty

`ARCHITECTURE.md` at the repo root (written during an earlier audit pass) describes several
security hardening changes (CORS allowlist, Helmet headers, an app-wide rate limiter) as having
been added and verified. Direct reading of `artifacts/api-server/src/app.ts` in this working copy
shows none of these are currently present in the code. This document describes the system **as
this working copy's source code actually shows it**, not as prior documentation describes it. See
the caveat in `00-README.md` and the full list in `15-Known-Issues.md`.
