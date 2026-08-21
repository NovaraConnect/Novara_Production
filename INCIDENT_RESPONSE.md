# Incident Response

This is a practical runbook for the failure modes this audit actually found or that are
structurally likely given the current architecture — not a generic incident-response template.
Where a failure mode was directly observed and fixed this session, that's noted explicitly so
whoever's on call knows it has already happened once.

## How to tell something is wrong

- **`GET /api/healthz`** on the api-server returns `{status, environment, databaseConnected,
  missingEnvVars?, databaseError?}` with HTTP 200 (`status: "ok"`) or 503 (`status: "degraded"`).
  This is the fastest signal. It now correctly reports `NEON_DATABASE_URL` if that's missing
  (fixed this session — it previously always misreported `DATABASE_URL` instead, a variable
  nothing in the code reads).
- No external uptime monitor or alerting was found configured anywhere in the reviewed code or
  Render dashboard. There is currently no automatic notification if the app goes down — someone
  has to notice, or a user has to report it.
- No centralized log aggregation was found beyond pino's structured logs going to Render's own log
  viewer. Render's free tier retains logs for a limited window; there is no long-term log storage.

## Failure mode: 401s / users can't sign in

**Already happened once.** Root cause was two separate Clerk instances configured across
frontend (`coherent-lionfish-59`) and backend (`smooth-bedbug-72`) — a session token issued by one
is meaningless to the other, so every authenticated request 401'd silently. Fixed by aligning both
to the same Clerk instance and adding `authorizedParties` to the backend's `clerkMiddleware`.

**If this recurs:** check that `CLERK_PUBLISHABLE_KEY` (backend) and `VITE_CLERK_PUBLISHABLE_KEY`
(frontend) resolve to the same Clerk instance in the Clerk dashboard, and that `FRONTEND_URL`
(backend) matches the actual deployed frontend origin exactly (no trailing slash — `app.ts`
depends on an exact string match for the CORS allowlist and for `authorizedParties`).

## Failure mode: database connection failures

`pool.query("SELECT 1")` failing in `/api/healthz` means either `NEON_DATABASE_URL` is unset/
wrong, or Neon itself is unreachable (Neon's serverless Postgres can have cold-start latency of
its own on low tiers, separate from Render's). Check the health endpoint's `databaseError` field
first — it surfaces the raw driver error message.

## Failure mode: slow first request / apparent downtime that resolves itself

**Expected behavior on the current infrastructure, not a bug.** The live backend
(`Novara-Mobile2-2`) runs on Render's free tier, which spins down after a period of inactivity and
takes 50+ seconds to cold-start on the next request. If someone reports "the app was down for
about a minute then worked," this is almost certainly that, not an actual incident. The real fix
is upgrading off the free tier before any launch beyond a small private pilot — see
`PRODUCTION_CHECKLIST.md` and the cost section of `LAUNCH_READINESS_REPORT.md`.

## Failure mode: notifications silently not sending

The daily notification cron (`scheduler.ts`) runs in-process at 09:00 UTC. Two independent ways
this goes quiet with no error surfaced anywhere obvious:
1. `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` unset — the scheduler logs a warning once at startup
   and never runs. Check startup logs, not runtime logs, for `"VAPID keys not configured"`.
2. The process was cold (Render free-tier spin-down) at 09:00 UTC and didn't wake until later —
   the cron job only fires if the process happens to be running at that exact time. There is no
   catch-up/backfill logic; a missed run is simply missed.

## Failure mode: CI red, but the app is still live

**By design, currently.** Render's auto-deploy triggers off GitHub pushes independently of CI's
pass/fail state — a red CI run does not block a Render deploy. If CI is red, treat it as "something
in the codebase doesn't typecheck or build cleanly," verify manually whether the specific commit
that's live on Render is affected, and don't assume a red CI run means production is broken (it
frequently won't be, since Render's build environment and CI's are not identical — see
`ARCHITECTURE.md` for the Node/pnpm version discrepancy between the two).

## Failure mode: unauthenticated abuse of the news proxy

`GET /api/company-news` has no `requireAuth` guard (confirmed by reading `news.ts` directly this
session). It proxies to GNews.io, which is capped at 100 requests/day on the free tier used here.
Anyone, authenticated or not, hitting this endpoint repeatedly can exhaust the daily quota for
every user. The app-wide rate limiter in `app.ts` (300 req/15min per source, added this session)
provides some protection but was not specifically tuned for this endpoint. If GNews-backed news
stops appearing app-wide, check whether the daily quota was exhausted before assuming an outage.

## Rollback

Render redeploys automatically from `main`. To roll back: revert the offending commit(s) on
`main` and let auto-deploy redeploy the reverted state, or use Render's dashboard to manually
redeploy a previous successful build if one is still cached. No blue/green or canary deployment
setup was found — a bad deploy replaces the running instance directly.

## What's explicitly not covered here

Payment/billing incidents (no payment processing was found in the reviewed code), data breach
response, and legal/compliance escalation paths are outside a technical audit's scope and are not
addressed in this document.
