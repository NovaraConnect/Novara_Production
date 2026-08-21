# 10 — Development

## Prerequisites

- Node.js — `nixpacks.toml` pins `nodejs_20` for the Replit/Nixpacks build path; no `engines`
  field exists in the root `package.json` to enforce a version locally (see `15-Known-Issues.md`).
- pnpm — the root `package.json`'s `preinstall` script actively refuses non-pnpm installs:
  `case "$npm_config_user_agent" in pnpm/*) ;; *) echo "Use pnpm instead" >&2; exit 1 ;; esac`,
  and also deletes any stray `package-lock.json`/`yarn.lock`. `nixpacks.toml` installs
  `pnpm@11.10.0` specifically. Use pnpm; nothing else will work.
- A Postgres connection string (Neon or any Postgres) for `DATABASE_URL`/`NEON_DATABASE_URL` — see
  the naming caveat in `03-Database.md`.

## Clone and install

```bash
git clone <repo-url>
cd Novara-Mobile2
pnpm install
```

## Environment setup

Copy `artifacts/api-server/.env.example` to `artifacts/api-server/.env` (or otherwise populate the
same variables in your environment) and fill in real values. See `17-Configuration-Reference.md`
for the full variable-by-variable reference. Minimum to run the backend at all:
`PORT`, `NEON_DATABASE_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.

## Run

Per `replit.md` (the repo's own scaffolding notes) and each package's `package.json`:

```bash
# API server (port 5000 per replit.md; PORT env var controls this)
pnpm --filter @workspace/api-server run dev

# Web frontend (Vite dev server; requires PORT and BASE_PATH env vars — see vite.config.ts)
pnpm --filter @workspace/project-novara run dev

# Mobile (Expo)
pnpm --filter @workspace/novara-mobile run dev
```

`@workspace/api-server`'s `dev` script is `build && start` (a full build then run), not a
watch-mode dev server — there is no hot-reload backend dev loop configured in this repository as
reviewed.

## Typecheck

```bash
pnpm run typecheck
```
Runs `tsc --build` at the root (for the shared `lib/*` packages) followed by per-package
`tsc -p tsconfig.json --noEmit` across every `artifacts/*` package and `scripts`
(`pnpm -r --filter "./artifacts/**" --filter "./scripts" --if-present run typecheck`).

## Build everything

```bash
pnpm run build
```
Runs the full typecheck first, then `pnpm -r --if-present run build` across every workspace
package that has a `build` script.

## Regenerate API client code (Orval)

```bash
pnpm --filter @workspace/api-spec run codegen
```
Regenerates `lib/api-zod` and `lib/api-client-react` from `lib/api-spec/openapi.yaml`, then
re-runs `pnpm -w run typecheck:libs`. As of this writing, the spec covers only `/healthz` — see
`04-API.md`.

## Database schema changes

```bash
pnpm --filter @workspace/db run generate   # generate a new Drizzle migration from schema changes
pnpm --filter @workspace/db run push        # push schema directly (dev only)
pnpm --filter @workspace/db run push-force  # force-push, skipping confirmation prompts
```

**Important:** this only covers the `feedback` table. `contacts`, `user_settings`, and
`push_subscriptions` have no Drizzle schema definitions and no migration files anywhere in the
repository — their live shape is documented in `artifacts/api-server/tests/schema.sql`, and any
change to them today would need to be applied by hand directly against the database, then that
test-schema file updated to match. See `03-Database.md` and `15-Known-Issues.md`.

## Tests

```bash
pnpm --filter @workspace/api-server run test   # vitest run
```
As of this writing, `artifacts/api-server/tests/feedback.test.ts` is the only test file found
anywhere in the repository. See `11-Testing.md` for full coverage detail and recommendations.

## Debugging

- **Backend:** structured logs via `pino` (JSON in production, `pino-pretty` colorized locally).
  `GET /api/healthz` is the fastest way to check DB connectivity and required env vars without
  digging through logs.
- **Frontend:** standard Vite dev server + React DevTools. The `@replit/vite-plugin-runtime-error-modal`
  plugin surfaces runtime errors as an in-browser overlay. `@replit/vite-plugin-cartographer` and
  `@replit/vite-plugin-dev-banner` are conditionally loaded only when both `NODE_ENV !== "production"`
  and `REPL_ID` is set (i.e. only inside an actual Replit dev environment).
- **Full incident-level debugging:** see `INCIDENT_RESPONSE.md` at the repo root.

## A note on this specific working copy

Before spending time debugging a discrepancy between what this document describes and what you
observe when actually running the app, read the caveat in `00-README.md` and the full list in
`15-Known-Issues.md` — this working copy shows multiple signs of being out of sync with both
production and (possibly) the GitHub `main` branch. Confirm you're working from the branch/commit
you think you are before assuming a discrepancy is a new bug.
