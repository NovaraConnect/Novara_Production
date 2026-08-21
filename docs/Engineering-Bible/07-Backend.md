# 07 — Backend

Covers `artifacts/api-server`: Express 5 on Node, TypeScript, ESM, built with `esbuild`
(`build.mjs`), started via `dist/index.mjs`.

## Folder organization

```
artifacts/api-server/
  src/
    app.ts              — Express app construction, middleware wiring
    index.ts             — process entrypoint (PORT validation, app.listen)
    db.ts                 — pg.Pool + Contact row↔camelCase mapping (dbToContact)
    lib/
      email.ts            — Resend feedback-notification email
      logger.ts           — pino structured logger
      priority.ts          — priority scoring + career-statement keyword extraction
      push.ts              — Web Push (VAPID) send wrapper
      scheduler.ts         — daily node-cron notification job
    middlewares/
      auth.ts              — requireAuth (Clerk session → req.userId)
      clerkProxyMiddleware.ts — proxies Clerk's Frontend API through this backend
    routes/
      index.ts             — mounts every route module onto one router
      health.ts, contacts.ts, settings.ts, notifications.ts, feedback.ts, news.ts, linkedin.ts
  tests/
    feedback.test.ts, testApp.ts (referenced), schema.sql, setup.ts
```

## Request pipeline (`app.ts`), in registration order

1. `pinoHttp` — structured request/response logging (method, URL without query string, status
   code) via `pino-http`, using the shared `logger` from `lib/logger.ts`.
2. `clerkProxyMiddleware()` mounted at `/api/__clerk` — **must** be registered before
   `express.json()` (per its own doc comment) since it proxies raw requests through to Clerk's
   Frontend API rather than parsing them locally. Only active when `NODE_ENV === "production"` and
   `CLERK_SECRET_KEY` is set; a no-op passthrough otherwise.
3. `cors({ credentials: true, origin: true })` — see `12-Security.md` for why this specific
   configuration is flagged as a concern.
4. `express.json()` / `express.urlencoded({ extended: true })`.
5. `clerkMiddleware(...)` — resolves the Clerk publishable key per-request from the proxied host
   (`publishableKeyFromHost`), attaching auth state to `req` for downstream `getAuth(req)` calls.
6. `app.use("/api", router)` — mounts every route module (see `routes/index.ts`).
7. `startScheduler()` — registers the daily cron job (see `05-Business-Rules.md` rule 9).

## Middleware

- **`requireAuth`** (`middlewares/auth.ts`) — the sole authorization gate. Reads
  `getAuth(req)?.userId`; if absent, responds `401 { error: "Unauthorized" }` and stops the chain.
  If present, attaches it as `(req as AuthedRequest).userId` for the route handler to use. This is
  the *only* place `userId` legitimately enters a request's processing — no route reads a
  client-supplied `userId` from the body or query string.
- **`clerkProxyMiddleware`** (`middlewares/clerkProxyMiddleware.ts`) — see `08-Authentication.md`
  for the full explanation of why this proxy exists and how it determines the canonical hostname
  (`getClerkProxyHost`, preferring `x-forwarded-host` over `Host`, taking the leftmost value when
  multiple hops are present).

## Controllers (routes)

Each file in `routes/` is a self-contained Express `Router` for one resource; see `04-API.md` for
the full per-endpoint contract. There is no separate "controller" layer distinct from the route
handlers themselves — route handlers directly call `pool.query(...)` (raw parameterized SQL, no
ORM at runtime) and shape the response inline. There is also no dedicated "service layer" —
business logic (priority calculation, cadence formulas) lives in `lib/`, imported directly by route
handlers.

## Data access pattern

All runtime database access goes through a single shared `pg.Pool` exported from `db.ts`,
constructed from `process.env.NEON_DATABASE_URL`. Every query is a raw, parameterized SQL string
(`pool.query("... WHERE user_id = $1", [userId])`) — there is no query builder or ORM in the
runtime path, despite `@workspace/db` (Drizzle) existing as a workspace package; that package is
used only for generating the `feedback` table's migration, not for querying it at runtime (the
`feedback` route uses the same raw `pg.Pool` as every other route). See `02-System-Architecture.md`
for the full explanation of this split.

Array columns (`interests`, `goal_tags`, etc.) are written using a hand-rolled Postgres array
literal formatter (`toArrayLiteral()`, duplicated identically in both `contacts.ts` and
`settings.ts`) rather than relying on the driver's native array parameter support.

## Validation

Validation is hand-written per route, inline — there is no shared schema-validation library used
consistently across routes at runtime (`zod` is a dependency and is used on the *frontend* for form
validation, e.g. `Feedback.tsx`, but the backend's own request validation in `feedback.ts` is
manual `isNonEmptyString`/length-check functions, not a Zod schema, despite `@workspace/api-zod`
existing as a workspace package). `contacts.ts` and `settings.ts` have essentially no request-body
validation beyond checking a few required fields are truthy (`POST /api/contacts` checks
`firstName`/`lastName`/`company`; most other fields are accepted and written with only `||`/`??`
fallbacks, not type or length validation).

## Error handling

There is no centralized Express error-handling middleware (`app.use((err, req, res, next) => ...)`)
found in `app.ts`. Each route handler wraps its own logic in `try/catch` and responds with a
route-specific `500` on failure; some log the error (`contacts.ts`, `settings.ts` use
`console.error`, not the structured `logger`), others swallow it silently and return a generic
message (`contacts.ts`'s `GET`/`DELETE` handlers, `settings.ts`'s `GET` handler). This is
inconsistent across routes — see `15-Known-Issues.md`.

## Logging

`lib/logger.ts` configures `pino` with `level` from `LOG_LEVEL` (default `"info"`), redaction of
`req.headers.authorization`, `req.headers.cookie`, and `res.headers['set-cookie']`, and
`pino-pretty` colorized output outside production. Route-level logging is inconsistent: some routes
use the structured `logger` (`feedback.ts`, `lib/email.ts`, `lib/push.ts`, `lib/scheduler.ts`),
others use plain `console.log`/`console.error` (`contacts.ts`, `settings.ts`, `news.ts`).
`settings.ts`'s `PUT /api/settings` handler in particular contains extensive step-by-step debug
`console.log` calls (labeled "step1" through "step7" in the code) that log the full incoming
request body (career statement, career goals, goal tags) and per-contact before/after priority
values on every request — see `12-Security.md`.

## Rate limiting

Only one rate limiter exists in the codebase: `feedbackLimiter` in `routes/feedback.ts` (10
requests/hour, keyed by authenticated `userId`, applied only to `POST /api/feedback`). There is no
app-wide rate limiter in `app.ts` — see `12-Security.md` and the caveat in `00-README.md` about
this contradicting the repo's own prior audit documentation.

## Security headers

No `helmet()` (or equivalent manual header-setting) call exists anywhere in `app.ts`, despite
`helmet` being listed as a dependency in `artifacts/api-server/package.json`. See `12-Security.md`.

## Background jobs

Covered in full in `02-System-Architecture.md` and `05-Business-Rules.md` (`lib/scheduler.ts`).
Worth restating here as a backend-architecture point: this is an in-process `node-cron` schedule,
not a separate worker process or job queue (no Redis, no BullMQ, no external scheduler). The entire
backend is a single Node process handling both HTTP traffic and the daily cron tick.

## Build

`artifacts/api-server/build.mjs` (invoked by `pnpm run build`) produces `dist/index.mjs`, an ESM
bundle built with `esbuild`. `pnpm run start` runs it directly with
`node --enable-source-maps ./dist/index.mjs`. `pnpm run dev` builds then starts in one step
(`NODE_ENV=development`, no separate watch-mode dev server config was found).
