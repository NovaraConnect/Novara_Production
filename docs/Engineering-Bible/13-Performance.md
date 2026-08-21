# 13 — Performance

## Caching

- **Company news:** `routes/news.ts` caches GNews results in-process (a plain `Map`, not Redis or
  any external cache) for 6 hours per `company|industry|role` key. On upstream failure, it falls
  back to a stale cache entry if one exists rather than failing the request. This cache is
  per-process and per-deploy — it is lost on every restart/redeploy, and is not shared across
  multiple backend instances if the service were ever scaled horizontally (it currently runs as a
  single instance, so this isn't a problem today, but would need to move to a shared cache — Redis,
  or a database table — before horizontal scaling).
- **Frontend query cache:** TanStack Query caches contacts (`staleTime: 30_000`) and settings
  (`staleTime: 60_000`) client-side, invalidated on mutation and on user-switch
  (`ClerkQueryClientCacheInvalidator` in `App.tsx`).
- **PWA asset caching:** `vite-plugin-pwa` with `injectManifest` strategy precaches the built
  frontend's static assets (`workbox-precaching`) via the hand-written `sw.ts` service worker,
  enabling the "works offline once loaded" claim made on `InstallGuide.tsx`.
- **No HTTP-level caching (ETags, `Cache-Control`) was found configured on API responses.**

## Database performance

- No explicit indexes beyond the implicit primary-key indexes were found in `tests/schema.sql` —
  no index on `contacts.user_id` (the single most common `WHERE` filter across almost every
  contacts query), `contacts.next_follow_up_date` (used for the default sort order and for the
  scheduler's due/overdue scan), or `feedback.user_id`. At the current scale (25 contacts/user
  cap, presumably a modest total user count during the beta phase), this is unlikely to matter yet,
  but it is a real gap that would surface as query latency growth if the user base or the
  per-user contact cap ever grows significantly.
- The settings-triggered priority recalculation (`05-Business-Rules.md` rule 5) batches its
  updates into a single `UPDATE ... FROM UNNEST(...)` query per settings save rather than one
  `UPDATE` per contact — a deliberate, real performance optimization, explicitly called out in the
  route's own log messages.
- A single `pg.Pool` (default `node-postgres` pool sizing — no explicit `max` was set in `db.ts`)
  is shared by the whole process; no separate read replica or connection-pooling proxy (e.g.
  PgBouncer) sits in front of Neon.

## Frontend performance

- Vite 7 + esbuild-based dev/build tooling (fast builds, native ES modules in dev).
- React 19, with `dedupe: ["react", "react-dom"]` in `vite.config.ts`'s resolve config —
  specifically to prevent "Invalid hook call" errors from a duplicate React copy, per the matching
  comment in `pnpm-workspace.yaml`'s `overrides` section (`"Force single React copy to prevent
  'Invalid hook call' errors with Clerk"`).
- Tailwind CSS 4 via `@tailwindcss/vite` (`optimize: false` explicitly set — meaning Tailwind's own
  build-time optimization pass is disabled; no comment in the repo explains why, so this is stated
  as observed, not explained).
- No explicit code-splitting/route-based lazy-loading (`React.lazy`/dynamic `import()`) was found
  in `App.tsx` — every page component is imported eagerly at the top of the file, meaning the
  initial JS bundle includes every page's code, not just the one being viewed.

## PWA-specific performance

Precaching via Workbox means the shell of the app loads fast on repeat visits and can render
offline; new deploys are picked up via `cleanupOutdatedCaches()` in `sw.ts` plus
`self.skipWaiting()`/`clientsClaim()` for immediate activation of a new service worker version
without requiring the user to fully close and reopen the app.

## Scalability constraints (structural, not measured — no load testing has been performed)

- **Single backend instance, in-process background jobs.** The notification scheduler and the
  news cache both live inside the same single Node process as the HTTP server. Scaling the backend
  horizontally (multiple instances) would need: the news cache moved to a shared store, and the
  cron job either made idempotent-safe-to-run-on-every-instance or moved to a dedicated
  single-runner (e.g. a Render Cron Job or an external scheduler), since running it on every
  instance today would send duplicate notifications.
- **No load/performance testing exists anywhere in this repository** (also independently noted in
  the pre-existing `LAUNCH_READINESS_REPORT.md`). Any performance claims beyond what's structurally
  observable in the code (as above) would be speculation and are not made here.

## Future scaling ideas (explicitly labeled as ideas)

- Add indexes on `contacts.user_id`, `contacts.next_follow_up_date`, and `feedback.user_id` as a
  low-risk, high-value first step once real usage data justifies it.
- Move the news cache to a shared store (Redis, or even a simple database table) before running
  more than one backend instance.
- Move the daily notification cron off the HTTP-serving process (a Render Cron Job trigging a
  dedicated script, or an external scheduler) so it isn't coupled to web-process uptime/cold-starts,
  and so it becomes safe to run multiple HTTP instances without duplicating notifications.
- Introduce route-level code splitting on the frontend if the initial bundle size becomes a
  measured problem (not yet confirmed to be one).
