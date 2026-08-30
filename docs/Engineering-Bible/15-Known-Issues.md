# 15 — Known Issues

Every item here was directly verified by reading source in this working copy during this
documentation effort (July 2026), unless explicitly marked as carried over from prior audit
documents without independent re-verification.

## 0. THE most important issue: this repository may not match production or GitHub `main`

Read this before anything else in this file. Multiple, independent, mutually-reinforcing pieces of
direct evidence — found while writing this documentation, not assumed — indicate this working copy
is out of sync with both the live production deployment and possibly the authoritative GitHub
`main` branch:

1. **Missing CI entirely.** No `.github` directory exists anywhere in this checkout, yet the
   repo's own `ARCHITECTURE.md`, `TEST_REPORT.md`, and `LAUNCH_READINESS_REPORT.md` describe a
   GitHub Actions workflow at `.github/workflows/ci.yml`, reported green at a specific commit SHA.
2. **Security fixes described as done are not present in the code.** Those same documents describe
   a CORS allowlist, Helmet security headers, and an app-wide rate limiter as added to `app.ts` and
   verified live. Direct reading of `app.ts` in this working copy shows none of these — open CORS
   (`origin: true`), no `helmet()` call despite it being a listed dependency, and no app-wide rate
   limiter.
3. **A previously-"fixed" env var bug is not fixed.** `ENVIRONMENT_VARIABLES.md` and
   `INCIDENT_RESPONSE.md` describe the `/api/healthz` required-vars check as having been corrected
   from `DATABASE_URL` to `NEON_DATABASE_URL` "this session." Direct reading of `health.ts` in this
   working copy shows it still checks `DATABASE_URL` (see item 3 below).
4. **A previously-"fixed" auth route is still open.** `LAUNCH_READINESS_REPORT.md` describes an
   "SSRF + missing-auth issue" on the LinkedIn import route as fixed and verified. Direct reading of
   `linkedin.ts` in this working copy shows no `requireAuth` present.
5. **The install-flow routing logic is materially simpler than expected.** `App.tsx`'s
   `HomeRedirect` has no install-flow-aware branching (no standalone-display-mode check, no
   "already seen the install prompt" check) — just a signed-in/signed-out split — even though the
   PWA manifest's `start_url` is `/install`.
6. **The live production Settings page looks different from this checkout's Settings page.**
   Directly observed during this same session: production shows two separate Support entries
   ("Report a bug" 🐞 and a feature-request equivalent). This checkout's `Settings.tsx` has a
   single "Send Feedback" entry.
7. **A hook that appears to call its dependency with the wrong arguments.** `useContacts.ts` passes
   `fetchContacts`/`createContact`/etc. directly as TanStack Query `queryFn`/`mutationFn` values,
   but those functions require a `getToken` callback as their first parameter — which TanStack
   Query does not supply. As written, this looks like it would throw at runtime.

**Most likely explanation:** this local working copy is a snapshot from partway through the
project's development, and later work was pushed to GitHub's `main` branch (and deployed to
production) through a path that never updated this checkout. **Action for whoever reads this
next:** diff this checkout against the current GitHub `main` branch and the actual code running in
the Render services before trusting either "this repository" or this documentation as fully
authoritative. This documentation describes what this checkout's source code actually contains,
which is the most honest thing it can do — but "honest about this checkout" and "true of
production" may not be the same thing right now.

## 1. `DATABASE_URL` vs. `NEON_DATABASE_URL` naming split

`artifacts/api-server/src/db.ts` (used by every route at runtime) reads
`process.env.NEON_DATABASE_URL`. `lib/db/src/index.ts` and `lib/db/drizzle.config.ts` (the Drizzle
migration tooling, not used at runtime) read `process.env.DATABASE_URL`. `render.yaml` provisions
`DATABASE_URL`. `health.ts`'s required-vars check also checks `DATABASE_URL`, not
`NEON_DATABASE_URL`. `artifacts/api-server/tests/setup.ts` uses `DATABASE_URL ?? NEON_DATABASE_URL`
as its fallback order — the opposite of what would make `db.ts` itself work if only one were set.
**Net effect:** for the live app to actually work (and per this session's own separate,
independent live production verification of the feedback feature, it does), the Render backend
service must have `NEON_DATABASE_URL` set directly, in addition to whatever `DATABASE_URL` value
`render.yaml` provisions — this is not visible anywhere in the repository's own configuration
files, only inferable from the fact that the app demonstrably works in production. This should be
consolidated to one variable name, used consistently everywhere.

## 2. Open CORS policy

`app.ts`: `cors({ credentials: true, origin: true })` — any origin, with credentials allowed. See
`12-Security.md` for full discussion.

## 3. `/api/healthz` checks the wrong DB variable name

`health.ts`'s `required` array includes `"DATABASE_URL"`, but the pool it's checking connectivity
for (`db.ts`) is constructed from `NEON_DATABASE_URL`. If only `NEON_DATABASE_URL` is set (and not
`DATABASE_URL`), the DB connectivity check itself (`pool.query("SELECT 1")`) would still correctly
report success, but the `missingEnvVars` list would incorrectly flag `DATABASE_URL` as missing even
though the database is fully functional — a misleading (though not connectivity-breaking) signal
for on-call debugging.

## 4. `helmet` dependency installed but never used

`artifacts/api-server/package.json` lists `helmet: ^8.3.0`, but no file in
`artifacts/api-server/src` imports or calls it.

## 5. No app-wide rate limiting

Only `POST /api/feedback` and `POST /api/parse-card-text` are rate-limited. See `12-Security.md`.

## 6. One unauthenticated, unrate-limited data route

`GET /api/company-news`. See `04-API.md` and `12-Security.md`.

(`POST /api/linkedin/import` was the second such route; it was removed entirely in PR #9, so
the backend no longer fetches linkedin.com at all.)

## 7. No migrations framework for three of four tables

`contacts`, `user_settings`, and `push_subscriptions` have no Drizzle schema and no migration
files — their shape lives only in `artifacts/api-server/tests/schema.sql`, a test fixture, not a
migrations tool. See `03-Database.md`.

## 8. `useContacts.ts` likely argument-count/shape mismatch

See item 0.7 above and `06-Frontend.md`. `updateContact`'s mutation wrapper
(`({ id, data }) => apiUpdateContact(id, data)`) is also missing the `getToken` first argument that
`lib/api.ts`'s `updateContact(getToken, id, data)` requires.

## 9. Verbose debug logging of user-typed personal data

`routes/settings.ts`'s `PUT /api/settings` handler logs the full request body (career statement,
goals, tags) and per-contact priority changes via `console.log` at multiple labeled steps ("step1"
through "step7"). Not a credential leak, but real personal data logged verbatim on every request.
See `12-Security.md`.

## 10. Inconsistent error logging and handling across routes

Some routes use the structured `logger` (`feedback.ts`, `lib/email.ts`, `lib/push.ts`,
`lib/scheduler.ts`); others use plain `console.log`/`console.error`
(`contacts.ts`, `settings.ts`, `news.ts`). Some swallow errors silently with a generic message
(`contacts.ts`'s `GET`/`DELETE`, `settings.ts`'s `GET`); others return the raw error message to the
client (`contacts.ts`'s `POST`/`PUT`: `detail: err instanceof Error ? err.message : String(err)`),
which risks leaking internal error detail (e.g. raw SQL error text) to API consumers. No
centralized Express error-handling middleware exists.

## 11. `importance` / `base_priority` column duplication

Both are written on every contact insert, but only `base_priority` (with `importance` as a
fallback) is read. Reads as an incomplete column-rename cleanup. See `03-Database.md`.

## 12. `feedback.status` lifecycle is declared but never transitioned by code

The schema comment describes `new`/`reviewing`/`resolved`/`closed`, but no route ever writes
anything other than the default `"new"`. See `03-Database.md`.

## 13. `notify_weekly_digest` and per-user `reminder_time` are stored but not fully wired

`user_settings.notify_weekly_digest` has no corresponding code path in `scheduler.ts` that sends a
digest. `reminder_time` is stored and shown in the UI, but the actual cron job is hardcoded to run
at `09:00 UTC` for every user regardless of this setting. See `03-Database.md`.

## 14. `migration/` directory is orphaned from the workspace

Not listed in `pnpm-workspace.yaml`'s `packages` glob, so it is not built, typechecked, or
otherwise exercised by tooling. References a Replit-era placeholder API URL
(`https://novara-api.replit.app`). Its exact relationship to `artifacts/novara-mobile` (a
superseding implementation? a reference kept for one specific piece of logic?) could not be
determined from the repository alone.

## 15. No `engines` field in `package.json`

No guardrail prevents a local developer from using an incompatible Node/pnpm version. The repo's
own prior audit docs describe a specific pnpm 11 / Node 20 incompatibility discovered when CI was
first added — consistent with there being no local enforcement of the versions `nixpacks.toml`
assumes.

## 16. No automated tests beyond one file

See `11-Testing.md` in full.

## 17. Carried over from prior audit documents, not independently re-verified this pass

These are stated in the repo's own root-level docs and are repeated here for completeness, since
this documentation effort did not have the tooling/access to re-verify them independently:

- No git-history secret scan has been performed (no authenticated clone access in any audit
  environment so far, per both this effort and the prior one).
- 4 apparently stale/duplicate Render services existed at the time of the prior audit, un-cleaned-up.
- No privacy policy or terms of service exists in the repository.
- No external uptime monitoring or alerting exists.
- No load/performance testing has been performed.

## What this list is not

This is not a claim that Novara is insecure or broken in production — several of the "gaps" listed
here (item 0 especially) may already be resolved in the actual deployed code; this working copy
simply doesn't show that resolution. Treat this list as "what a careful reading of the code you
have in front of you shows," and reconcile against the live system before prioritizing fixes.
