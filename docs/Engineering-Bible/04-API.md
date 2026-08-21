# 04 — API

All routes are mounted under `/api` (`app.use("/api", router)` in `app.ts`). The router composition
lives in `artifacts/api-server/src/routes/index.ts`. Base URL in production:
`https://novara-mobile2.onrender.com/api` (per `render.yaml`'s `VITE_API_BASE_URL`).

Authentication: routes marked **Auth: required** call `requireAuth` (`middlewares/auth.ts`), which
reads the verified Clerk session via `getAuth(req)` and returns `401 { error: "Unauthorized" }` if
there's no `userId`. `userId` is **always** taken from the verified session, never from the request
body — every route handler that touches the database uses `(req as AuthedRequest).userId`, not any
client-supplied field.

See also: `diagrams/api-sequence.mmd`, `diagrams/feedback-flow.mmd`.

## Health

### `GET /api/healthz`
- **Auth:** none
- **Purpose:** liveness/readiness probe; configured as `render.yaml`'s `healthCheckPath`.
- **Response `200`:** `{ status: "ok", environment, databaseConnected: true, timestamp }`
- **Response `503`:** `{ status: "degraded", environment, databaseConnected: false, databaseError?, missingEnvVars?, timestamp }`
- **Business rule:** runs `SELECT 1` against the pool from `db.ts`; also checks that `DATABASE_URL`,
  `CLERK_SECRET_KEY`, and `PORT` are set. Note: `db.ts`'s pool is actually constructed from
  `NEON_DATABASE_URL`, not `DATABASE_URL` — this check currently validates the wrong variable name
  for the DB connection string specifically (see `15-Known-Issues.md`).

## LinkedIn import

### `POST /api/linkedin/import`
- **Auth:** none (confirmed by direct reading — no `requireAuth` in `routes/linkedin.ts`)
- **Request:** `{ url: string }` — must match `linkedin\.com\/in\//i`
- **Response `200`:** `{ firstName?, lastName?, role?, company?, linkedinUrl, location?, parsedFromSlug: boolean }`
- **Response `400`:** missing/invalid URL
- **Response `422`:** page fetched but no usable data extracted (`{ error, partial }`)
- **Response `502`:** fetch failed or timed out (10s timeout via `AbortController`)
- **Business rule:** server-side-fetches the given LinkedIn URL with a spoofed browser
  `User-Agent` and tries three extraction strategies in priority order: JSON-LD `Person` schema →
  Open Graph meta tags → `<title>` tag → (if still nothing) parsing the profile URL's slug itself
  (stripping a trailing ID-looking segment). This is a server-side fetch of an arbitrary
  (LinkedIn-domain-restricted) URL — see `12-Security.md` for the SSRF-adjacent discussion.

## Company news

### `GET /api/company-news?company=&industry=&role=`
- **Auth:** none (confirmed — no `requireAuth` in `routes/news.ts`)
- **Response `200`:** `{ company, headlines: Headline[], fetchedAt, fromCache, error?, detail?, stale? }`
- **Business rule:** queries GNews.io for `"<company>"` (quoted phrase), then runs every candidate
  article through a scoring/tiering heuristic (`scoreArticle()`) that weighs: company name in
  title/body, capitalization signal (proper-noun match vs. lowercase false-positive), nearby
  context terms (exec titles, funding/M&A/hiring vocabulary) within a ±10-word window, and
  industry/role term overlap. Articles are bucketed into `high`/`medium`/`low`/`discard` tiers and
  the top 3 qualified results are returned. Results are cached in-process for 6 hours per
  `company|industry|role` key; a GNews fetch failure falls back to a stale cache entry if one
  exists, otherwise returns an empty list with `error: "timeout" | "fetch_failed"` rather than a
  non-200 status.
- **Known gap:** GNews's free tier is capped at 100 requests/day; this route has no per-user rate
  limit or auth gate, so it can be hit anonymously and repeatedly — see `12-Security.md`.

## Contacts

All contacts routes: **Auth: required**, all scoped by `user_id`.

### `GET /api/contacts`
Returns all of the caller's contacts, ordered by `next_follow_up_date ASC`.

### `POST /api/contacts`
- **Request:** `firstName`, `lastName`, `company` required; plus `linkedinUrl`, `email`, `phone`,
  `role`, `metAt`, `importance`, `initialFollowUpDays`, `followUpCadenceDays`, `goalTags`,
  `connectionStatus`, `notes`, `industry`, `function`, `interests` (all optional).
- **Response `201`:** the created contact (camelCase, via `dbToContact()`).
- **Response `400`:** missing required fields.
- **Response `403`:** `{ error: "Contact limit reached", code: "CONTACT_LIMIT_REACHED" }` if the
  caller already has 25 contacts (`FREE_TIER_LIMIT`).
- **Business rule:** on create, `current_priority` is the AI suggestion from
  `computeSuggestedPriority()` (`@workspace/novara-priority`) using the user's
  `career_goals`/`goal_tags`/`career_statement`, unless the request sets `priorityOverride`.
  `follow_up_cadence_days` is derived from the effective priority unless `cadenceOverride` is set.
  Accepts `priorityOverride`, `currentPriority`, `cadenceOverride`. See `05-Business-Rules.md`.

### `GET /api/contacts/:id`
`404` if not found or not owned by the caller.

### `PUT /api/contacts/:id`
Partial update; every field is optional and only overwritten if present in the request body
(`COALESCE` against the existing row). If `priorityOverride` is true and a `currentPriority` is
supplied, that value is used verbatim; otherwise priority is recomputed.

### `DELETE /api/contacts/:id`
`404` if not found/not owned, else `{ success: true }`.

### `POST /api/contacts/:id/mark-contacted`
No request body. Sets `last_interaction_date = CURRENT_DATE` and recomputes
`next_follow_up_date` — see `05-Business-Rules.md` for the exact auto-downgrade logic this
implements.

### `POST /api/contacts/import`
- **Request:** `{ contacts: object[] }` — a bulk import path explicitly for migrating contacts
  previously stored in browser `localStorage` (per the route's own comment,
  `// POST /api/contacts/import  (localStorage migration)`).
- **Response `200`:** `{ imported: number, skipped: number }`. Uses `ON CONFLICT DO NOTHING` per
  row; a row that fails for any reason is silently counted as `skipped`, not surfaced individually.

## Settings

All settings routes: **Auth: required**.

### `GET /api/settings`
Returns `{ autoDowngradeAfterMonths, careerStatement, goalTags, careerGoals, hasSeenTutorial }`.
If the user has no `user_settings` row yet, returns hardcoded defaults without creating one.

### `PUT /api/settings`
- **Request:** any subset of `autoDowngradeAfterMonths`, `careerStatement`, `goalTags`,
  `hasSeenTutorial`, `careerGoals`.
- **Response `200`:** the updated settings, plus a `recalculation` report
  (`{ ok, examined, updated, priorityOverridesSkipped, cadenceOverridesSkipped, failures }`) or
  `null` when the profile didn't change.
- **Business rule — synchronous recalculation:** if `careerGoals`, `goalTags`, or `careerStatement`
  changed, `recalculateContactsForUser` (`lib/recalculate.ts`) runs **synchronously** before the
  response, recomputing `current_priority` and re-deriving `follow_up_cadence_days` for **every
  non-overridden contact** (skipping `priority_override` / `cadence_override` rows), via a single
  batched `UPDATE ... FROM UNNEST(...)`. The same function backs `POST /api/contacts/recalculate`.
  See `05-Business-Rules.md`.
- **Note:** this handler currently contains extensive step-by-step `console.log` debug output
  (payload contents, per-contact before/after priority values, batch update row counts) — see
  `12-Security.md` and `15-Known-Issues.md`.

## Notifications

### `GET /api/notifications/vapid-public-key`
- **Auth:** none (deliberately — needed before the browser's permission prompt, so there's nothing
  user-specific to protect here).
- **Response `200`:** `{ publicKey }`, or `503` if VAPID isn't configured.

### `GET /api/notifications/settings` / `PUT /api/notifications/settings`
**Auth: required.** Get/set `pushEnabled`, `notifyDueToday`, `notifyOverdue`,
`notifyStatusChange`, `notifyWeeklyDigest`, `reminderTime`. `PUT` upserts a `user_settings` row if
none exists first.

### `POST /api/notifications/subscribe`
**Auth: required.** Body: `{ endpoint, keys: { p256dh, auth } }` (a browser `PushSubscription`).
Upserts into `push_subscriptions` and sets `push_enabled = true`.

### `DELETE /api/notifications/subscribe`
**Auth: required.** Body: `{ endpoint? }` — deletes one subscription if `endpoint` given, else all
of the caller's subscriptions; also sets `push_enabled = false`.

### `POST /api/notifications/test`
**Auth: required.** Sends a literal test push ("Push notifications are working!...") to every
subscription the caller has. `400` if the caller has none. Any subscription that returns
"gone" (410/404) is deleted as a side effect.

## Feedback

### `POST /api/feedback`
- **Auth: required**, plus a dedicated rate limit: `feedbackLimiter` — 10 submissions/hour, keyed
  by the authenticated `userId` (never by IP alone, so it can't be evaded by rotating networks and
  won't over-penalize users behind a shared NAT/proxy).
- **Request:** `type` (`bug`|`feature`|`general`, required), `subject` (required, ≤200 chars),
  `description` (required, ≤5000 chars), `contactEmail` (optional, validated with a permissive
  regex — explicitly documented as a UX sanity check, not a security boundary), `mayContact`
  (boolean), `pageUrl`/`userAgent`/`appVersion` (optional diagnostic strings, ≤500/500/50 chars).
- **Response `201`:** `{ id, type, subject, status: "new", createdAt }`.
- **Response `400`:** validation failure (specific field-level messages).
- **Response `429`:** rate limit exceeded, `{ error: "Too many feedback submissions. Please try again later." }`.
- **Business rule:** the DB row is written and the `201` response sent **before** attempting to
  send the notification email — a failed email send is logged
  (`"Failed to send feedback notification email"`) but never rolls back or fails the submission
  itself. See `05-Business-Rules.md` and `diagrams/feedback-flow.mmd`.

## What's not covered by the OpenAPI spec

`lib/api-spec/openapi.yaml` currently documents only `/healthz`. None of the routes above besides
health are captured in the spec, so the generated `lib/api-zod` and `lib/api-client-react` packages
do not currently cover contacts, settings, notifications, feedback, news, or LinkedIn import — the
frontend calls these directly via hand-written `fetch` wrappers in
`artifacts/project-novara/src/lib/api.ts` instead of generated hooks. See `17-Configuration-Reference.md`
for the Orval codegen setup this spec feeds.
