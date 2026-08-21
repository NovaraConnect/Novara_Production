# Testing

This document explains the automated test suite added to Novara: what it covers, how to run it locally, how it runs in CI, and how to extend it.

## What's covered

The suite is intentionally minimal — it exists to catch four classes of regression, not to reach 100% coverage:

- **Authentication regressions**, like the Clerk instance/audience mismatch that caused a production 401 incident. Every protected route is tested to confirm it returns 401 without a valid signed-in user, and that a Clerk verification failure fails closed (401), not open or with a 500.
- **Authorization regressions** — one signed-in user reading, editing, or deleting another user's data. Contacts are the only entity with per-user ownership in the schema, so cross-user access is tested explicitly for view, edit, and delete.
- **CRUD regressions** in the core product surface: contacts and settings.
- **Configuration regressions**: a missing database connection string, an incorrect frontend API base URL, and a CORS misconfiguration that would silently break the deployed frontend talking to the deployed backend.

It does not attempt to test every field, every UI state, or every edge case in business logic (priority scoring, cadence suggestions, news fetching, etc.). Those are lower-risk and can get dedicated tests later if they cause real incidents.

## Running tests locally

### Backend (`artifacts/api-server`)

The backend tests run against a real Postgres database (not a mock), using Supertest to call the actual Express app in-process.

```bash
# from artifacts/api-server, with a local Postgres available:
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/novara_test
pnpm run test
```

If you don't have Postgres running locally, the quickest option is Docker:

```bash
docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=novara_test postgres:16
```

The test schema (`tests/schema.sql`) is applied automatically the first time a test runs; every test truncates all tables in `beforeEach`, so tests are isolated and can run in any order (though they run single-threaded/single-fork since they share one database).

You do not need real Clerk credentials to run the backend suite — `@clerk/express` is mocked in `tests/setup.ts` so tests authenticate via an `x-test-user-id` header instead of a real session token.

### Frontend unit tests (`artifacts/project-novara`)

```bash
pnpm --filter @workspace/project-novara run test
```

These are plain Vitest unit tests with no browser or server involved — they cover `API_BASE` (env parsing) and `apiFetch`/`fetchContacts` (request construction, auth header, error handling) with `fetch` mocked.

### Frontend E2E tests (Playwright)

E2E exercises the real built app (via `vite preview`, i.e. the same static output that ships to production) in a real Chromium browser, signing in through Clerk's actual hosted `<SignIn>` component. There is no way to mock this for a true end-to-end test, so it needs:

1. A **dedicated Clerk test user**, on a **dedicated Clerk test instance** — never a real account, never the production Clerk instance.
2. A **running API server** the built frontend can actually call. Unlike the unit suites, these specs create, search, edit, and delete a real contact through the real API — there's nothing to assert if the request has nowhere to land.

To run locally:

```bash
# 1. Start Postgres and create + seed a dedicated E2E database (never reuse
#    a database that has real user data in it):
docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
PGPASSWORD=postgres psql -h localhost -U postgres -c "CREATE DATABASE novara_e2e;"
PGPASSWORD=postgres psql -h localhost -U postgres -d novara_e2e -f artifacts/api-server/tests/schema.sql

# 2. Start the API server against that database, using your Clerk *test*
#    instance's keys:
cd artifacts/api-server
DATABASE_URL=postgres://postgres:postgres@localhost:5432/novara_e2e \
  CLERK_PUBLISHABLE_KEY=pk_test_... \
  CLERK_SECRET_KEY=sk_test_... \
  FRONTEND_URL=http://localhost:5173 \
  PORT=3001 \
  pnpm run build && pnpm run start

# 3. In another terminal, build the frontend against that API server and the
#    same Clerk test instance, then run Playwright:
cd artifacts/project-novara
PORT=5173 VITE_API_BASE_URL=http://localhost:3001 VITE_CLERK_PUBLISHABLE_KEY=pk_test_... pnpm run build
PORT=5173 \
  CLERK_SECRET_KEY=sk_test_... \
  E2E_CLERK_TEST_EMAIL=test-user@example.com \
  E2E_CLERK_TEST_PASSWORD=... \
  pnpm exec playwright install --with-deps chromium && pnpm run test:e2e
```

Without `CLERK_SECRET_KEY` / `E2E_CLERK_TEST_EMAIL` / `E2E_CLERK_TEST_PASSWORD`, `e2e/auth.setup.ts` skips itself and every test in `e2e/contacts.spec.ts` fails at its first navigation (landing on the signed-out homepage instead of `/dashboard`) — expected, not a bug in the tests.

**Why a local API server instead of the deployed Render staging/production stack:** E2E targets a frontend and API server started fresh inside the same job/machine, backed by a dedicated, disposable `novara_e2e` database — not `https://novara-mobile2-frontend.onrender.com` or the production API. This was a deliberate choice over pointing E2E at deployed Render infrastructure:

- **Isolation.** A local, disposable database means E2E can never read, modify, or delete real founder/user data, even by accident. Pointing at Render's staging or production stack would put every E2E run one bug away from mutating real records.
- **Determinism.** No dependency on Render's uptime, cold starts, deploy timing, or concurrent traffic from other test runs or real users.
- **Speed.** Everything runs in one job with no external round-trips.

## How CI works

`.github/workflows/ci.yml` runs on every push and pull request to `main`, with a `postgres:16` service container available to the job. Steps run in this order, and **all must pass before a PR can merge** (with the exception of the E2E steps, explained below):

1. Install dependencies
2. Typecheck
3. Backend tests
4. Frontend unit tests
5. Build

The Playwright E2E steps run after Build, but only once all four secrets below are present as GitHub Actions repository secrets. Until a maintainer adds them, every E2E step is skipped rather than blocking merges — they are not yet part of the required check set.

Required secrets (Settings → Secrets and variables → Actions → Repository secrets), all sourced from a dedicated Clerk **test** instance and a dedicated Clerk **test** user — never production, never a real founder/user account:

| Secret name | What it is |
| --- | --- |
| `CLERK_TEST_SECRET_KEY` | The Clerk test instance's secret key (`sk_test_...`). Used both to generate a valid test session token (`@clerk/testing`) and by the locally-started API server to verify that token. |
| `VITE_CLERK_TEST_PUBLISHABLE_KEY` | The same Clerk test instance's publishable key (`pk_test_...`). Baked into the E2E frontend build so `<ClerkProvider>` talks to the right instance. Publishable keys are meant to be public/embedded in frontend bundles — this is stored as a secret purely for consistency, not because it's sensitive. |
| `E2E_CLERK_TEST_EMAIL` | The dedicated test user's email. |
| `E2E_CLERK_TEST_PASSWORD` | The dedicated test user's password. |

When configured, the CI job also: creates a fresh `novara_e2e` Postgres database on the same service container backend tests use; builds the frontend a second time with the real test-instance keys and `VITE_API_BASE_URL` pointing at a local API server; starts that API server in the background and waits for `/api/healthz`; then runs Playwright against it. On completion (pass or fail), traces/screenshots/videos are uploaded as the `playwright-report` workflow artifact (7-day retention) for debugging — except for the "setup" project (`auth.setup.ts`, where the test password is typed), which always runs with tracing/video/screenshots off so the test credential is never written into an artifact.

The whole suite (steps 1-5, excluding optional E2E) is designed to finish in well under 5 minutes; the backend and frontend unit suites are small and fast by design (see "What's covered").

## Adding new tests

- **Backend**: add a new `*.test.ts` file under `artifacts/api-server/tests/`. Import `app` and helpers from `./testApp` (`authHeaders(userId)` for an authenticated request, `forcedAuthErrorHeaders()` to simulate a Clerk verification failure). Every test gets a clean, empty database via the global `beforeEach` in `tests/setup.ts` — don't rely on state from other tests.
- **Frontend unit**: add a `*.test.ts` file next to the module it tests under `artifacts/project-novara/src/`. Keep these to pure logic (no DOM) — anything that needs a real browser belongs in E2E instead.
- **E2E**: add a new `*.spec.ts` file under `artifacts/project-novara/e2e/`. Every spec automatically reuses the signed-in session from `auth.setup.ts` (the `chromium` project depends on `setup`), so you don't need to sign in again inside each test.

Before adding a new test, ask whether it would have caught a real incident or a real class of bug — the goal of this suite is to stay fast and high-signal, not to maximize test count.

## E2E status

_Updated once the suite has actually been run against real Clerk test credentials in CI — see the latest CI run for current pass/fail counts. Until then, the E2E steps above are wired up but skipped (no secrets configured yet), and this repo's automated launch-readiness claims should treat E2E as **not yet verified**, not as passing._
