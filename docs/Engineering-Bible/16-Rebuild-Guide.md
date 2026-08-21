# 16 — Rebuild Guide

This document answers: "if a competent team were starting Novara over today, with everything
learned from this codebase, what would they do differently?" It is explicitly speculative in a way
the rest of this documentation is not — it is offered as informed opinion grounded in what this
audit found, not as a plan anyone has committed to.

## What to keep unchanged

The parts of the current architecture that work well and shouldn't be thrown out in a rewrite:

- **The fail-soft pattern for optional integrations** (push, email, news — see
  `14-Architecture-Decisions.md`). This is good, tested-by-reality design; keep it as an explicit
  principle from day one instead of an emergent pattern.
- **`priorityOverride` as an escape hatch.** Computed defaults with an explicit, sticky manual
  override is the right UX pattern for this kind of "smart" feature — never fight it, let a human
  freeze it.
- **Clerk for auth.** Nothing found in this audit suggests Clerk itself was the wrong choice — the
  problems found (instance misconfiguration) are operational/configuration issues, not reasons to
  switch providers.
- **A PWA as the primary client**, given the product's current beta stage and iteration speed —
  shipping to every platform from one codebase without app-store review latency is a real advantage
  early on.

## What to change

### 1. Pick one ORM/query layer and use it everywhere, from the start

The current split — Drizzle schema/migrations for `feedback` only, raw `pg.Pool` queries for
everything including `feedback` itself at runtime — should never have been allowed to happen. A
rebuild should commit to Drizzle (or any ORM) as the single source of truth for schema *and* the
actual runtime query layer, with every table defined and migrated through it from table one. This
alone would have prevented issues 1, 7, and 11 in `15-Known-Issues.md`.

### 2. Real migrations from the first table, no exceptions

`contacts` and `user_settings` — the two most important tables in the product — currently have no
migration history at all. A rebuild should never allow a table to exist only as a hand-applied
`CREATE TABLE` with no tracked migration.

### 3. One environment variable name per concept, enforced by a single config module

The `DATABASE_URL`/`NEON_DATABASE_URL` split (`15-Known-Issues.md` item 1) is exactly the kind of
bug that a single, validated config-loading module (reading all env vars once, at startup, with
explicit required/optional declarations and one canonical name each) would make structurally
impossible. `zod`'s already a dependency in this codebase — a `zod`-validated env schema loaded
once in `index.ts` would have caught this at process startup instead of it surfacing as ambiguous
production behavior.

### 4. Global request validation from day one

Given `zod` and `@workspace/api-zod` already exist in this workspace, every route should validate
its request body against a shared schema (ideally the same schema driving the OpenAPI spec in
`lib/api-spec`) rather than hand-rolled per-route checks of inconsistent thoroughness. This closes
the `contacts.ts`/`settings.ts` validation gap in `12-Security.md` structurally, not just by adding
more manual checks.

### 5. Security middleware (headers, CORS allowlist, rate limiting) as part of the initial
   scaffold, not an afterthought

`helmet()`, an explicit CORS allowlist, and an app-wide rate limiter should be in the very first
version of `app.ts`, not added later (and, per this audit's findings, apparently later removed or
never actually landed despite being documented as done). Bake this into whatever project template/
scaffold is used to start the rebuild.

### 6. A real migrations-and-CI-gates-deploy pipeline from commit one

The prior audit's own finding — "CI is green but does not gate Render's auto-deploy" — should be
solved structurally: deploy should be a required-status-check-gated GitHub Action, not two
independent, uncoordinated systems (CI and Render's own auto-deploy) that happen to usually agree.

### 7. Tests alongside every business-rule-bearing file, not after

`lib/priority.ts` and the cadence/auto-downgrade logic in `contacts.ts` are the highest-value,
lowest-effort tests possible (pure functions, no I/O) and yet are entirely untested. A rebuild
should treat "a business rule has no test" as a blocking code-review comment, not a backlog item.

## Migration strategy, if a rewrite happened alongside a live product

Given Novara's actual current state (a live, beta-stage product with real users' contact data in
Neon Postgres):

- **Zero-downtime migration** would mean standing up the new backend against the *same* Postgres
  database (or a live-replicated copy), behind a feature flag or a gradual traffic shift at the
  load-balancer/DNS level — not a hard cutover. Given the current single-instance, no-staging-
  environment setup (`09-Deployment.md`), this would first require actually building a staging
  environment, which doesn't exist today.
- **Data migration:** since the schema itself (`contacts`, `user_settings`, `push_subscriptions`,
  `feedback`) is comparatively simple and already documented precisely in `03-Database.md`, a
  rewrite that keeps the same schema shape could migrate with a straightforward `pg_dump`/restore
  or logical replication — the risk is much more in behavior parity (priority scoring, cadence
  math) than in data structure.
- **Scaling strategy:** move the notification cron and the news cache off the single HTTP-serving
  process before ever running more than one backend instance (see `13-Performance.md`) — this is a
  prerequisite for horizontal scaling, not optional.

## What this document deliberately does not do

It does not propose a specific new tech stack (framework, hosting provider, etc.) — none of that is
grounded in anything found in this repository, and inventing a "recommended stack" would violate
this documentation set's core rule of not inventing content. The recommendations above are all
direct responses to specific, observed problems in the current codebase, not a wishlist.
