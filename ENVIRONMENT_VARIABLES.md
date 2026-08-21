# Environment Variables

This is the full inventory of environment variables read by Novara's three deployable
artifacts: the API server (`artifacts/api-server`), the web frontend (`artifacts/project-novara`,
deployed as `novara-mobile2-frontend`), and the mobile client (`artifacts/novara-mobile`, a
static Expo Go deployment). It was built by grepping actual `process.env.*` / `import.meta.env.*`
usage in source, not by trusting existing docs — one real mismatch was found and fixed in the
process (see the `NEON_DATABASE_URL` row below).

Secret values are never reproduced here. "Failure behavior" describes what actually happens in
code when a variable is absent, verified by reading the relevant source, not assumed.

## API server (`artifacts/api-server`)

| Variable | Required | Secret | Source of truth | Failure behavior if unset |
|---|---|---|---|---|
| `PORT` | Yes | No | `.env.example`, Render | Defaults to `8080` in most setups, but if genuinely unset the server may fail to bind. Also checked by `/api/healthz` as a "required" var. |
| `NODE_ENV` | Recommended | No | `.env.example` | Defaults to unset/`development`-like behavior; `health.ts` reports whatever value is present, `"unknown"` if empty. |
| `NEON_DATABASE_URL` | Yes | Yes (connection string with credentials) | `db.ts`, `.env.example` | `pool` is constructed with `connectionString: undefined`, so the first query fails at runtime. `/api/healthz` now correctly flags this as missing (fixed this session — it previously checked the wrong variable name, `DATABASE_URL`, which nothing in the codebase reads). Note: `db.ts` actually reads `DATABASE_URL ?? NEON_DATABASE_URL` (`DATABASE_URL` takes priority if both are set) — Render's `render.yaml` currently provisions `DATABASE_URL`. |
| `CLERK_PUBLISHABLE_KEY` | Yes | No (publishable by design, but treat as environment-specific) | `app.ts`, `.env.example` | Clerk middleware initializes with an undefined key; auth will not function and most requests will 401. |
| `CLERK_SECRET_KEY` | Yes | Yes | `app.ts`, `.env.example`, `/api/healthz` required list | Same as above — Clerk cannot verify sessions server-side. Correctly checked by the health endpoint. |
| `FRONTEND_URL` | Yes (prod) | No | `app.ts` | Used both for the CORS allowlist and as Clerk's `authorizedParties`. Falls back to a hardcoded default (`https://novara-mobile2-frontend.onrender.com`) if unset, which happens to be correct in this deployment but is fragile if the frontend URL ever changes. |
| `GNEWS_API_KEY` | Yes, for the news feature | Yes | `news.ts`, `.env.example` | The `/api/company-news` route will fail its upstream fetch; the route degrades rather than crashing the process. Free tier is capped at 100 req/day, and this route is currently **not behind `requireAuth`** — see Section 4 API Security in the launch readiness report. |
| `VAPID_PUBLIC_KEY` | No (feature-gated) | No | `.env.example`, `scheduler.ts` | If either VAPID key is missing, `startScheduler()` logs a warning and disables the notification cron job entirely. No crash. |
| `VAPID_PRIVATE_KEY` | No (feature-gated) | Yes | `.env.example`, `scheduler.ts` | Same as above. |
| `VAPID_SUBJECT` | No | No | `.env.example` | Defaults to `mailto:hello@novara.app` in the example file; used as the VAPID contact subject for push. |
| `RESEND_API_KEY` | No (feature-gated) | Yes | `lib/email.ts`, `.env.example` | If unset, `POST /api/feedback` still saves the submission to the database, but `sendFeedbackNotification` logs a warning and skips sending the email — no crash, no lost data. |
| `FEEDBACK_TO_EMAIL` | No | No | `lib/email.ts`, `.env.example` | Defaults to `novaraconnect@gmail.com` if unset. |
| `RESEND_FROM_EMAIL` | No | No | `lib/email.ts`, `.env.example` | Defaults to Resend's shared sandbox sender (`onboarding@resend.dev`), which only delivers to the email address that owns the Resend account. Verify a domain in Resend and set this for reliable delivery to any `FEEDBACK_TO_EMAIL`. |
| `LOG_LEVEL` | No | No | `.env.example`, `logger.ts` (pino) | Defaults to pino's own default level if unset. |

## Web frontend (`artifacts/project-novara`, deployed as `novara-mobile2-frontend`)

Vite exposes these at build time via `import.meta.env`; they are baked into the static bundle,
so they are **not secrets** by the time they reach the browser regardless of intent.

| Variable | Required | Secret | Failure behavior if unset |
|---|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | No (public by design) | Clerk's frontend SDK cannot initialize; the app will not be able to sign users in. |
| `VITE_CLERK_PROXY_URL` | Yes (this app proxies Clerk through the backend) | No | Clerk requests fail to route through the configured proxy path; falls back to Clerk's default behavior, which may not match the CORS/auth setup here. |
| `BASE_URL` | No (Vite built-in) | No | Vite supplies this automatically; not something to configure manually. |

## Mobile client (`artifacts/novara-mobile`, static Expo Go deployment)

| Variable | Required | Secret | Failure behavior if unset |
|---|---|---|---|
| `EXPO_PUBLIC_DOMAIN` | Conditionally required at build time | No | `scripts/build.js` throws `"ERROR: No deployment domain found"` and the build fails outright if none of the three fallback variables (below) is set. This was hit for the first time this session when CI ran the build for the first time ever — production has always had this set via Render, so it was never exposed. |
| `REPLIT_DEV_DOMAIN` | Fallback #1 for the above | No | Only relevant in a Replit dev environment. |
| `REPLIT_INTERNAL_APP_DOMAIN` | Fallback #2 (highest priority) | No | Only relevant when actually running inside Replit's infrastructure. |
| `REPL_ID` | No | No | Used to decide whether to load Replit-only dev tooling (`@replit/vite-plugin-cartographer`); irrelevant outside Replit. |
| `PORT` | Dev-only | No | Used by the Expo/Metro dev server; not meaningful for the static production build. |
| `BASE_PATH` | No, mobile-specific | No | Not required by `novara-mobile`; this is a `project-novara`/`mockup-sandbox` concept, not shared. |

## Internal / dev-only tool (`artifacts/mockup-sandbox`)

Not part of the deployed product (it has no entry in `render.yaml`), but its build script
(`vite.config.ts`) hard-fails without these, which is why CI needs placeholder values:

| Variable | Required | Secret | Failure behavior if unset |
|---|---|---|---|
| `PORT` | Yes, to build | No | `vite.config.ts` throws `"PORT environment variable is required but was not provided"` and the build aborts. |
| `BASE_PATH` | Yes, to build | No | Same file throws `"BASE_PATH environment variable is required but was not provided"`. |

## What CI sets that production does not need to

`.github/workflows/ci.yml` sets `PORT`, `BASE_PATH`, and `EXPO_PUBLIC_DOMAIN` as build-time-only
values for the two artifacts above, purely so the monorepo build script completes. These are not
secrets and do not need to be mirrored into Render's environment variable settings — they only
exist because CI is a colder, more isolated environment than Render's build layer, which already
had all of this configured (that's also why these gaps only surfaced once CI existed at all).

## Known gaps, called out honestly

- No `engines` field is declared in the root `package.json`, so Node/pnpm version requirements
are enforced only by `nixpacks.toml` (production) and `.github/workflows/ci.yml` (CI) — there is
no guardrail preventing a local developer from using an incompatible Node/pnpm combination and
hitting the exact pnpm 11 / Node 20 crash this session diagnosed in CI.
- A full history scan for accidentally committed secrets (`git log -p | grep`, or a tool like
`trufflehog`/`gitleaks`) was **not performed** — the sandbox used for this audit has no
authenticated git access to clone the private repo's full history, only GitHub's web UI and API
reads of the current `main` branch state. This is a real limitation, not a clean bill of health;
it should be run by someone with repo clone access before calling secrets handling fully audited.
