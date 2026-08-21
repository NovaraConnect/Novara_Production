# Production Checklist

Grouped by must-fix-before-any-launch, should-fix-before-wider-launch, and nice-to-have. This is
the actionable companion to `LAUNCH_READINESS_REPORT.md` — that document explains why; this one
lists what to actually do.

## Must-fix before even a private pilot

- [ ] **Add auth to `GET /api/company-news`.** Currently unauthenticated; anyone can exhaust the
  shared GNews.io daily quota (100 req/day on the current tier) for every user. Add `requireAuth`
  consistent with every other data route in `contacts.ts`/`settings.ts`/`notifications.ts`.
- [ ] **Add basic uptime monitoring.** Nothing currently notifies anyone if the app goes down.
  A free external pinger hitting `/api/healthz` on a few-minute interval is enough to start.
- [ ] **Confirm Clerk is on production/live keys, not dev keys**, before inviting real pilot users
  (this was already flagged as an open item — task #3 in the working task list — and should be
  resolved before pilot users create real accounts).
- [ ] **Decide and communicate a real data-retention/privacy stance to pilot users**, even
  informally — there is currently no privacy policy or terms of service in the repo. For a small
  known-user pilot this can be a direct conversation rather than a legal document, but it shouldn't
  be silent.

## Should-fix before any launch wider than a small private pilot

- [ ] **Move off Render's free tier for the backend.** The 50+ second cold-start delay after
  inactivity is the single biggest reliability constraint found in this audit, and it also silently
  breaks the daily notification cron if the process is cold at 09:00 UTC.
- [ ] **Wire CI to actually gate deploys.** Right now Render auto-deploys from `main` independently
  of whether CI passed. A red CI run currently has no teeth.
- [ ] **Add a minimal automated test suite**, starting with the API's auth-gated routes (see
  `TEST_REPORT.md` for the prioritized order). Zero tests exist today; every fix made this session
  was verified manually, which doesn't scale and doesn't prevent regressions.
- [ ] **Run a full manual pass of core user flows**: sign up, sign in, sign out, add/edit/delete a
  contact, reload mid-session, expired-session handling, empty and error states, PWA install. None
  of this was exercised end-to-end this session beyond the specific 401 and SSRF fixes.
- [ ] **Run a git-history secret scan** (e.g. `gitleaks` or `trufflehog` against the full clone
  history) from an environment with authenticated repo access. This audit's sandbox could not do
  this — only the current `main` branch state was reviewed, not history.
- [ ] **Clean up the 4 apparently stale/duplicate Render services.** Not touched this session per
  the audit's restriction on unapproved infrastructure changes, but they add cost and confusion.
  Confirm they're genuinely unused, then decommission them deliberately with cost/billing approval.
- [ ] **Add an `engines` field to the root `package.json`** pinning the Node/pnpm versions actually
  required, so a local developer doesn't hit the pnpm 11 / Node 20 crash this session diagnosed in
  CI, and so the production (Node 20) vs CI (Node 22) discrepancy gets a documented, intentional
  answer instead of continuing to just "work."
- [ ] **Resolve, not just work around, the Node 20 (production) vs Node 22 (CI) discrepancy.**
  Currently both work, but the mechanism (Render's build cache preserving pnpm approval state) is
  inferred, not confirmed. Worth deliberately testing a Node 22 production deploy in a controlled
  way, or deliberately pinning production to a version confirmed compatible with pnpm 11.

## Nice-to-have / lower urgency

- [ ] Centralized log aggregation with real retention (currently only Render's own short-retention
  log viewer).
- [ ] A staging environment distinct from production — none currently exists.
- [ ] A migrations framework for schema changes — none was found in the audited tree; changes
  appear to happen by hand today.
- [ ] Native mobile builds (App Store / Play Store) if mobile distribution beyond Expo Go /
  direct-link sharing is ever a goal — out of scope for a pilot, worth flagging for later.

## Cost estimate (directional, not a quote)

| Tier | Users | Notes | Rough monthly cost |
|---|---|---|---|
| Current (free) | Private pilot, ~5–30 | Cold starts, no autoscaling, no monitoring cost | $0, but reliability cost is real |
| Small paid | Pilot to early public, ~30–500 | Paid Render web-service tier (eliminates cold start), same free-tier Postgres likely still adequate | Roughly tens of dollars/month |
| Growth | 500–5,000 | Paid Postgres tier, possibly multiple backend instances, GNews usage likely needs a paid tier if news feature stays enabled for everyone | Scales with instance count and GNews plan; get current pricing directly from Render and GNews before committing, since this audit did not fetch live pricing pages |

These figures are directional based on the architecture found, not sourced from current Render/
GNews pricing pages — verify current pricing before budgeting.

## Explicit non-goals of this checklist

This does not cover legal review, formal security penetration testing, or compliance
certifications (SOC 2, HIPAA, etc.) — none of those were requested and none are addressed here.
