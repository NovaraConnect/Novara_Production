# 17 — Configuration Reference

For narrative explanation of *why* these exist, see `09-Deployment.md`, `10-Development.md`, and
`14-Architecture-Decisions.md`. This document is the flat reference. No secret values are
reproduced anywhere below — names and behavior only, per the same convention used in the repo's own
`ENVIRONMENT_VARIABLES.md`.

## Environment variables — API server (`artifacts/api-server`)

| Variable | Required | Secret | Read by | Default / failure behavior |
|---|---|---|---|---|
| `PORT` | Yes | No | `index.ts` | Throws `"PORT environment variable is required but was not provided."` if unset |
| `NODE_ENV` | Recommended | No | `app.ts`, `clerkProxyMiddleware.ts`, `logger.ts`, `health.ts` | Controls prod-only Clerk proxy activation, pino-pretty vs. JSON logs, and the `environment` field in `/api/healthz` |
| `NEON_DATABASE_URL` | Yes (for `db.ts`, used at runtime) | Yes | `db.ts` | Pool constructed with `connectionString: undefined` if unset; all data routes fail |
| `DATABASE_URL` | Yes (for Drizzle tooling; also checked by `/api/healthz`) | Yes | `lib/db/src/index.ts`, `lib/db/drizzle.config.ts`, `health.ts` | See `15-Known-Issues.md` item 1 for the naming split with `NEON_DATABASE_URL` |
| `CLERK_PUBLISHABLE_KEY` | Yes | No (publishable by design) | `app.ts` | Clerk middleware initializes with an undefined key; auth breaks |
| `CLERK_SECRET_KEY` | Yes | Yes | `app.ts`, `clerkProxyMiddleware.ts`, `health.ts` | Clerk cannot verify sessions server-side |
| `FRONTEND_URL` | Documented in `.env.example` as used for CORS/`authorizedParties` | No | Not referenced anywhere in this working copy's `app.ts` — see `15-Known-Issues.md` item 0/2 | N/A in current code |
| `GNEWS_API_KEY` | Only for the news feature | Yes | `news.ts` | Route degrades, returns empty headlines with an error field |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Only for push notifications | Public key: No / Private key: Yes | `push.ts`, `scheduler.ts` | Scheduler and push sends silently disabled with a warning log if either is missing |
| `VAPID_SUBJECT` | No | No | `push.ts` | Defaults to `mailto:hello@novara.app` |
| `RESEND_API_KEY` | No (feature-gated) | Yes | `lib/email.ts` | Feedback still saves; email notification skipped with a warning log |
| `FEEDBACK_TO_EMAIL` | No | No | `lib/email.ts` | Defaults to `novaraconnect@gmail.com` |
| `RESEND_FROM_EMAIL` | No | No | `lib/email.ts` | Defaults to Resend's shared sandbox sender `Novara Feedback <onboarding@resend.dev>`, which can only deliver to the email address that owns the Resend account |
| `LOG_LEVEL` | No | No | `logger.ts` | Defaults to pino's own default (`"info"` per this repo's `.env.example`) |

## Environment variables — web frontend (`artifacts/project-novara`)

Vite build-time variables — baked into the static bundle, not secret once shipped.

| Variable | Required | Read by |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | `App.tsx` |
| `VITE_CLERK_PROXY_URL` | Yes (this app proxies Clerk through the backend) | `App.tsx` |
| `VITE_API_BASE_URL` | Yes (per `render.yaml`) | Frontend `lib/api.ts` (`API_BASE`, via `apiBase.ts`) |
| `PORT` | Yes, to build/serve | `vite.config.ts` — throws if unset |
| `BASE_PATH` | Yes, to build | `vite.config.ts` — throws if unset; also sets Vite's `base` |
| `BASE_URL` | No (Vite built-in) | Supplied automatically by Vite from `BASE_PATH` |

## Environment variables — mobile (`artifacts/novara-mobile`)

| Variable | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_DOMAIN` | Conditionally, at build time | `scripts/build.js` fails outright without this or a fallback |
| `REPLIT_DEV_DOMAIN` | Fallback | Replit dev environment only |
| `REPLIT_INTERNAL_APP_DOMAIN` | Fallback (highest priority) | Replit infra only |
| `REPL_ID` | No | Gates Replit-only dev tooling |
| `PORT` | Dev-only | Expo/Metro dev server |

## Environment variables — internal tool (`artifacts/mockup-sandbox`)

| Variable | Required | Notes |
|---|---|---|
| `PORT` | Yes, to build | Same pattern as `project-novara`'s `vite.config.ts` |
| `BASE_PATH` | Yes, to build | Same pattern |

## Config files

| File | Purpose |
|---|---|
| `pnpm-workspace.yaml` | Workspace package globs, shared dependency `catalog:`, `minimumReleaseAge: 1440` (a 1-day supply-chain-attack defense — packages must be published ≥1 day before pnpm will install them, with an explicit, narrow `minimumReleaseAgeExclude` allowlist for `@replit/*` and `stripe-replit-sync`), and platform/package `overrides` (notably forcing a single React 19.1.0 copy everywhere to prevent Clerk-related hook errors). |
| `render.yaml` | The two production Render services (backend web service, frontend static site) — build commands, start commands, health check path, and declared env var names (not values). |
| `nixpacks.toml` | Alternative/Replit-oriented build config (`nodejs_20`, `pnpm@11.10.0`), separate from `render.yaml`. |
| `tsconfig.base.json` / `tsconfig.json` | Shared TypeScript compiler settings inherited by every package's own `tsconfig.json`. |
| `.npmrc` | pnpm/npm registry configuration (not read in detail during this pass — see the file directly). |
| `lib/db/drizzle.config.ts` | Drizzle Kit config — points at `DATABASE_URL`, output directory `lib/db/drizzle`. |
| `lib/api-spec/orval.config.ts` | Orval codegen config — generates `lib/api-zod` and `lib/api-client-react` from `openapi.yaml`. |
| `artifacts/project-novara/vite.config.ts` | Frontend build config: PWA manifest/service-worker strategy, path aliases (`@` → `src`, `@assets` → `attached_assets`), dev/preview server ports. |
| `artifacts/project-novara/components.json` | shadcn/ui component-generator config (also present, identically, in `artifacts/mockup-sandbox`). |

## Scripts (root `package.json`)

| Script | Command |
|---|---|
| `preinstall` | Refuses non-pnpm installs; deletes stray `package-lock.json`/`yarn.lock` |
| `build` | `pnpm run typecheck && pnpm -r --if-present run build` |
| `typecheck:libs` | `tsc --build` (shared `lib/*` packages) |
| `typecheck` | `typecheck:libs` then per-package typecheck across `artifacts/*` and `scripts` |

## Per-package scripts worth knowing

| Package | Script | Command |
|---|---|---|
| `@workspace/api-server` | `dev` | `NODE_ENV=development` then build then start (no watch mode) |
| `@workspace/api-server` | `build` | `node ./build.mjs` (esbuild bundle → `dist/index.mjs`) |
| `@workspace/api-server` | `start` | `node --enable-source-maps ./dist/index.mjs` |
| `@workspace/api-server` | `test` | `vitest run` |
| `@workspace/project-novara` | `dev`/`build`/`serve` | Vite dev/build/preview, all requiring `PORT`+`BASE_PATH` |
| `@workspace/db` | `generate`/`push`/`push-force` | Drizzle Kit migration commands (`feedback` table only) |
| `@workspace/api-spec` | `codegen` | Orval codegen + `typecheck:libs` |
| `@workspace/novara-mobile` | `dev` | Expo start, wired to Replit-specific env vars for tunneling |
| `@workspace/novara-mobile` | `build`/`serve` | `scripts/build.js` / `server/serve.js` |

## External dependencies (services, not npm packages)

| Service | Role | Config |
|---|---|---|
| Clerk | Authentication | `CLERK_*` / `VITE_CLERK_*` |
| Neon | Postgres hosting | `NEON_DATABASE_URL` / `DATABASE_URL` |
| Render | App hosting (backend + frontend) | `render.yaml` |
| GNews.io | Company news search | `GNEWS_API_KEY` (100 req/day, free tier) |
| Resend | Transactional email | `RESEND_API_KEY` (3,000 emails/month, free tier, per `.env.example`'s comment) |
| Web Push (VAPID, no vendor) | Browser push notifications | `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` |
| GitHub | Source control; also the trigger source for Render's auto-deploy | — |
| Expo Go | Mobile client distribution | `artifacts/novara-mobile` |

## Key npm dependencies worth knowing about (not exhaustive — see each `package.json`)

- **Backend:** `@clerk/express`, `express` 5, `pg`, `pino`/`pino-http`, `resend`, `web-push`,
  `node-cron`, `express-rate-limit`, `http-proxy-middleware`, `helmet` (installed, unused — see
  `15-Known-Issues.md`).
- **Frontend:** `@clerk/react`, `wouter`, `@tanstack/react-query`, `react-hook-form` +
  `@hookform/resolvers` + `zod`, `vite-plugin-pwa`, the full shadcn/Radix UI component set,
  `tailwindcss` 4.
- **Shared:** `drizzle-orm`/`drizzle-zod`/`drizzle-kit` (`lib/db`), `orval` (`lib/api-spec`).
