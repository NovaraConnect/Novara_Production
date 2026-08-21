# 11 — Testing

## What actually exists, as of this working copy

A repo-wide search for `*.test.ts`/`*.spec.ts` (and equivalents) finds exactly one file:
**`artifacts/api-server/tests/feedback.test.ts`**, using `vitest` + `supertest`, plus its
supporting fixtures `artifacts/api-server/tests/setup.ts` and `artifacts/api-server/tests/schema.sql`
(a hand-maintained schema used only to give a test Postgres instance something to talk to — see
`03-Database.md`). There is no test file for `contacts.ts`, `settings.ts`, `notifications.ts`,
`news.ts`, `linkedin.ts`, or `health.ts`, and no frontend test files (unit, integration, or
end-to-end/Playwright) anywhere in `artifacts/project-novara` or `artifacts/novara-mobile`.

This directly contradicts the pre-existing `LAUNCH_READINESS_REPORT.md`/`TEST_REPORT.md` at the
repo root, which describe a Playwright E2E suite and a broader backend test suite as existing —
see the caveat in `00-README.md`. As checked out in this working copy, only the feedback backend
tests are present.

## What the feedback test suite covers

`feedback.test.ts` mocks `sendFeedbackNotification` (so it never needs a real Resend key) and
tests, against a real ephemeral Postgres instance and the actual Express app:

- `401` for an unauthenticated `POST /api/feedback`.
- `401` when Clerk verification is deliberately forced to fail (`forcedAuthErrorHeaders()`).
- `201` for a valid authenticated submission, with the correct `type`/`subject`/`status: "new"` in
  the response.

(The file continues beyond what's excerpted here — read it directly for the full assertion list,
including the "email failure doesn't lose the DB row" case implied by the mock setup comment.)

## Test infrastructure

- **Runner:** `vitest` (`artifacts/api-server/package.json`, `"test": "vitest run"`).
- **HTTP assertions:** `supertest` against the real `app` export, not a mocked server.
- **Auth in tests:** `testApp.ts` (referenced by `feedback.test.ts` but not read in detail during
  this documentation pass) exports `authHeaders(userId)` and `forcedAuthErrorHeaders()` helpers,
  implying a test-mode Clerk bypass rather than exercising real Clerk tokens in CI.
- **Database:** a real Postgres instance, schema-bootstrapped from `tests/schema.sql`, connected
  via `DATABASE_URL` (per `setup.ts`'s own comment: "Real DB connectivity still comes from
  `DATABASE_URL`... `DATABASE_URL ?? NEON_DATABASE_URL`" — note this fallback order is the
  *opposite* of what `db.ts` itself does at runtime; see `15-Known-Issues.md`).

## What's explicitly not tested

Everything not listed above: contacts CRUD, priority calculation (`lib/priority.ts`), cadence
formulas, settings and the background priority-recalculation job, notifications (subscribe/
unsubscribe/send), the LinkedIn scraper, the company-news scorer, the `requireAuth` middleware in
isolation, and the entire frontend (no component tests, no E2E). None of the business rules
documented in `05-Business-Rules.md` — several of which are genuinely intricate (the priority
scoring bidirectional-substring-match, the auto-downgrade date math, the news-article tiering
heuristic) — have any automated regression protection.

## Manual QA checklist (a starting point, not exhaustive)

Given the near-total absence of automated coverage, here is a baseline manual pass worth running
before any release, in priority order (adapted from, and consistent with, the prioritization
already given in the repo's own `TEST_REPORT.md`):

1. Sign up → sign in → sign out → sign back in.
2. Add a contact (all fields; then a second with only the required fields).
3. Edit a contact, including toggling `priorityOverride` on and off.
4. Mark a contact as contacted; confirm `next_follow_up_date` advances by the expected cadence.
5. Change career statement/goals in Settings; confirm contact priorities visibly update within a
   few seconds (the async recalculation described in `05-Business-Rules.md` rule 5).
6. Delete a contact.
7. Submit feedback (bug and feature type) and confirm the success toast.
8. Install the PWA (both iOS Safari "Add to Home Screen" and Android's install prompt) and
   relaunch it from the home screen — specifically check what page it lands on (see the install-flow
   caveat in `05-Business-Rules.md` rule 7).
9. Enable push notifications, send a test notification, confirm delivery.
10. Import a contact via a LinkedIn URL.
11. Reach the 25-contact limit and confirm the `403`/upgrade messaging appears correctly.
12. Exercise an expired/invalid session (e.g. revoke the session in Clerk's dashboard mid-session)
    and confirm the app degrades to a sign-in prompt rather than erroring opaquely.

## Known limitations of the current testing approach

- Single test file means a change to `contacts.ts`, `settings.ts`, or `lib/priority.ts` — the
  highest-business-logic-density files in the backend — has zero automated protection against
  regressions.
- No frontend tests at all, so UI regressions (including exactly the kind of routing/navigation
  discrepancies flagged in `00-README.md`) are only caught by manual testing or user reports.
- No load/performance testing exists or has been performed (also independently noted in the
  repo's `LAUNCH_READINESS_REPORT.md`).

## Recommended priority order for closing the gap (not a commitment, a suggestion)

1. Backend tests for `contacts.ts` and `settings.ts` — highest business-logic density, and already
   `user_id`-scoped with clear expected status codes, making them relatively cheap to write.
2. A unit test suite for `lib/priority.ts` specifically — it's pure functions
   (`computeSuggestedPriority`, `deriveSuggestedCadence` in `@workspace/novara-priority`) with no I/O, the cheapest possible tests to
   write, covering the most intricate business logic in the app.
3. A minimal frontend E2E smoke test (sign-in → view dashboard → add a contact), since that's the
   core loop the product exists to support.
4. Wiring whatever CI exists to actually gate deploys, so a red test run has consequences.
