# Launch Readiness Report

## Bottom line

**Novara is not ready for a full public worldwide launch. It is reasonably ready for a controlled
private pilot** — a small, known group of users, ideally invited rather than open sign-up, with
someone actively watching it for the first couple of weeks. That's a real, evidence-based
conclusion, not a hedge: the app has a working core loop, a genuine (if serious) 401 bug that was
found and fixed this session, no automated tests, free-tier hosting with 50+ second cold starts,
and at least one unauthenticated route that can exhaust a shared third-party API quota. None of
that is disqualifying for a pilot with real people you can talk to if something breaks. All of it
is disqualifying for "publish the link and let anyone sign up."

This report synthesizes the full audit. Supporting detail lives in `ARCHITECTURE.md`,
`ENVIRONMENT_VARIABLES.md`, `TEST_REPORT.md`, `INCIDENT_RESPONSE.md`, and `PRODUCTION_CHECKLIST.md`.

## What was actually done this session, not just found

This audit's mandate was to make safe, evidence-backed fixes where the evidence clearly supported
them, not just write recommendations. The following were fixed and verified, not merely flagged:

- **Fixed a live, active authentication bug.** Frontend and backend were configured against two
  different Clerk instances, so every session token issued by the frontend was invalid on the
  backend — a silent, total-outage-grade auth failure. Aligned both to one instance and added
  `authorizedParties` to the backend's Clerk middleware so it only accepts tokens from the known
  frontend origin. Verified end-to-end on the live deployment.
- **Hardened CORS.** `app.ts` previously allowed `origin: true` (any origin, with credentials) —
  a real cross-origin credential-theft risk. Replaced with an explicit allowlist.
- **Added security headers and a rate limiter** where none existed.
- **Fixed an SSRF + missing-auth issue** on the LinkedIn import route; verified via direct endpoint
  testing after deploy.
- **Fixed a real `.env.example`/health-check bug**: the health endpoint checked for `DATABASE_URL`,
  a variable nothing in the code reads, instead of `NEON_DATABASE_URL`, the one `db.ts` actually
  uses — meaning the health check would always misreport a missing DB variable even when the
  database was fully configured and working.
- **Built the repo's first-ever CI pipeline** (`.github/workflows/ci.yml`), now green, enforcing
  TypeScript typecheck and a full build on every push/PR to `main`. This immediately caught and led
  to fixing two real pre-existing type errors and four instances of demo/seed data in the **live
  production frontend** violating the app's own type contract.

All of this is grounded in source code read directly, local reproduction, or live endpoint/deploy
verification — not inference. Where something could not be verified (see "Known gaps" below), that
is stated plainly rather than assumed fine.

## Findings by area

**Auth & authorization.** Now correctly wired to a single Clerk instance with `authorizedParties`
enforced. Every reviewed API route scopes its database queries by `user_id` from the verified
session (`contacts.ts`, `settings.ts`, `notifications.ts`). One gap remains: `GET
/api/company-news` has no `requireAuth` at all — see API security below.

**Temporary debug code.** `auth.ts` was reviewed directly; no stray `console.log` of tokens,
user objects, or secrets was found in the current state of the auth middleware. This does not
constitute a full repo-wide debug-statement sweep (see known gaps).

**Secrets & environment variables.** Full inventory in `ENVIRONMENT_VARIABLES.md`. One real
mismatch found and fixed (`DATABASE_URL` vs `NEON_DATABASE_URL`). No `engines` field exists in
`package.json`, so version requirements are enforced only by CI and `nixpacks.toml`, not by any
local guardrail. A full git-history secret scan was **not performed** — the audit sandbox has no
authenticated git clone access, only GitHub's web UI/API against the current `main` state. This is
a real gap, not a clean bill of health, and should be run before calling secrets handling audited.

**Database safety & multi-tenancy.** Single Neon Postgres instance, no read replicas. Every query
path reviewed scopes by `user_id`. No migrations framework was found in the audited tree, meaning
schema changes appear to happen by hand — a process risk for any future schema change, not an
active bug.

**API security.** CORS hardened, headers and rate limiting added, SSRF/auth bug fixed this session.
Remaining gap: `/api/company-news` proxies to GNews.io (capped at 100 requests/day on the tier in
use) with no auth guard — anyone can exhaust the shared daily quota for every user. This is a
functional/availability risk, not a data-exposure one, but it's real and unresolved.

**CORS & headers.** Fixed this session (see above). Verified live.

**Frontend reliability.** Not comprehensively tested. Verified: sign-in works post-Clerk-fix, and
a live deploy with the CORS/security changes completed successfully. Not verified: full sign
up/in/out cycle, contact CRUD under real conditions, session-expiry handling, offline/error states,
PWA install behavior. Listed as an outstanding pre-launch item in `PRODUCTION_CHECKLIST.md`.

**Mobile / Expo status.** `novara-mobile` is a static Expo Go deployment (pre-bundled JS opened via
the Expo Go client), not a native App Store/Play Store build. It has no independent app-store
presence or review process. Anyone using it needs the Expo Go app and a direct link. This is fine
for a pilot with people you can hand a link to; it is not a "download our app" launch.

**Notifications / background jobs.** A single in-process `node-cron` job runs daily at 09:00 UTC,
gated on VAPID keys being present (fails safe — logs a warning, doesn't crash if absent). Because
it runs inside the same process as the HTTP server, a Render free-tier cold start at exactly that
time will delay or entirely skip that day's notification run, with no catch-up logic. This is a
real reliability gap tied directly to the free-tier hosting decision.

**Observability.** No external uptime monitoring, no alerting, no centralized/long-retention log
aggregation was found — only Render's own log viewer and pino's structured logs. The `/api/healthz`
endpoint is the best current signal and now reports the correct missing-variable name. Recommend
adding a free-tier uptime check (e.g., a simple external pinger) before any wider launch, since
right now nobody is notified if the app goes down.

**Health checks & deployment reliability.** `/api/healthz` works and was fixed this session. CI is
green but does **not** gate Render's auto-deploy — a red CI run does not block a bad deploy from
going live. Production runs Node 20 via `nixpacks.toml` while CI now runs Node 22 (required for
pnpm 11.x); production currently works despite this (verified via live deploy logs) but the
discrepancy is not fully understood, only worked around, and is flagged honestly in
`ARCHITECTURE.md` rather than claimed resolved.

**Performance & scalability.** Not load-tested. Structurally, the biggest constraint by far is
Render's free tier: single instance, no autoscaling, 50+ second cold start after inactivity. This
is very likely fine for a private pilot of a handful to a few dozen people who tolerate an
occasional slow first load, and is very likely a bad experience at any real public scale.

**Data privacy.** Contacts and personal data are stored in a single Postgres database scoped by
`user_id`; no evidence of data being shared with third parties beyond the already-documented GNews
and Web Push integrations. No privacy policy, terms of service, or data-retention/deletion policy
was found in the audited tree — this is a legal/product gap, not something this audit can resolve
technically, and should be addressed before any launch involving people outside a trusted pilot
group. This audit is not legal advice; consult someone qualified before broader launch.

**User safety.** No user-generated public content, messaging between strangers, or other
obvious abuse surface was found in this app's feature set (it's a personal contact-tracking tool).
The main safety-adjacent finding is the unauthenticated news-proxy route, which is a
resource-exhaustion risk rather than a user-safety one.

**Cost estimates.** See `PRODUCTION_CHECKLIST.md` for the itemized breakdown. Directionally: the
current free-tier Render setup costs nothing but caps out fast on reliability; a small paid tier
sufficient for a private pilot is inexpensive (tens of dollars/month range); costs scale mainly
with Render instance tier and GNews API usage if that quota becomes a bottleneck.

**Automated testing.** Zero automated tests exist anywhere in the repo (verified via repo-wide
search). CI now enforces typecheck and build only. Full detail and a prioritized recommendation for
what to test first is in `TEST_REPORT.md`. A green CI run is a floor, not a launch signal.

**GitHub workflow.** First-ever CI pipeline added and verified green this session
(`.github/workflows/ci.yml`, run #12, commit `846aa31`). It does not currently gate deploys.

## Known gaps, stated plainly

- No git-history secret scan (no authenticated clone access in this environment).
- No full manual pass of user-facing flows.
- No load/performance testing.
- No privacy policy / terms of service found.
- 4 apparently stale/duplicate Render services exist and were not cleaned up (flagged, not
  touched, consistent with the prohibition on unapproved infrastructure changes).
- The Node 20 (production) vs Node 22 (CI) discrepancy works today but isn't fully explained.

## Recommendation

Treat this as ready for a **controlled private pilot**: a known, small group, ideally invited
rather than open sign-up, for the first few weeks, with the items in `PRODUCTION_CHECKLIST.md`
(especially uptime monitoring and the news-proxy auth gap) addressed first. Do not describe this as
ready for a full public worldwide launch — the evidence here doesn't support that claim.
