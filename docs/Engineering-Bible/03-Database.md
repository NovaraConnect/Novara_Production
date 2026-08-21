# 03 — Database

See also: `diagrams/database-erd.mmd`.

## Overview

A single Neon (serverless Postgres) database. Four tables exist, per direct reading of
`artifacts/api-server/tests/schema.sql` (which documents the real, hand-applied production shape)
and `lib/db/drizzle/0000_steep_the_captain.sql` (the one Drizzle-generated migration, for
`feedback` only): `contacts`, `user_settings`, `push_subscriptions`, `feedback`. All are scoped by
a `user_id` text column holding a Clerk user ID — **not a foreign key**, because Clerk, not this
database, owns the user record. Every query reviewed in `routes/*.ts` filters by `user_id` taken
from the verified Clerk session.

There is no formal migrations framework covering `contacts`, `user_settings`, or
`push_subscriptions` — see `02-System-Architecture.md` and `15-Known-Issues.md`.

## `contacts`

The core entity. One row per person the user is tracking.

| Column | Type | Default | Purpose |
|---|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` | |
| `user_id` | `text` NOT NULL | — | Clerk user ID (owner) |
| `first_name`, `last_name` | `text` NOT NULL | — | |
| `linkedin_url` | `text` | — | Optional; populated by `routes/linkedin.ts` import or manual entry |
| `company` | `text` NOT NULL | — | |
| `role` | `text` | — | |
| `met_at` | `text` | — | Free-text context of where/how they met |
| `importance` | `text` NOT NULL | `'Medium'` | Legacy/duplicate of `base_priority` — see note below |
| `base_priority` | `text` NOT NULL | `'Medium'` | User-set priority: `High`/`Medium`/`Low` |
| `current_priority` | `text` NOT NULL | `'Medium'` | Computed priority (see `05-Business-Rules.md`), or frozen to a manual value if `priority_override` is true |
| `priority_override` | `boolean` NOT NULL | `false` | If true, `current_priority` is never recomputed automatically |
| `industry` | `text` | — | Used as a signal in priority scoring |
| `function` | `text` | — | e.g. job function/department; also a priority-scoring signal |
| `interests` | `text[]` NOT NULL | `'{}'` | Free-form tags; a priority-scoring signal |
| `initial_follow_up_days` | `integer` NOT NULL | `7` | Days until the *first* follow-up after adding the contact |
| `follow_up_cadence_days` | `integer` NOT NULL | `30` | Days between follow-ups thereafter |
| `goal_tags` | `text[]` NOT NULL | `'{}'` | Per-contact goal tags, merged into the priority calculation |
| `connection_status` | `text` NOT NULL | `'connected'` | `connected` or `pipeline` |
| `first_contact_date` | `date` NOT NULL | `CURRENT_DATE` | |
| `last_interaction_date` | `date` NOT NULL | `CURRENT_DATE` | Updated by `mark-contacted` |
| `next_follow_up_date` | `date` NOT NULL | `CURRENT_DATE` | Drives "due today"/"overdue" logic and notifications |
| `notes` | `text` | — | |
| `email`, `phone` | `text` | — | Optional contact info, matches `db.ts`'s `Contact` type |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | `now()` | |

**Why both `importance` and `base_priority` exist:** `routes/contacts.ts` writes the same
incoming value to both columns on insert (`$10, $10` in the parameterized `INSERT`, with the code
comment "`$10` is used for both importance and base_priority (both text, no type conflict)").
`db.ts`'s `dbToContact()` reads `base_priority ?? importance` as the source of truth, falling back
to `importance` only if `base_priority` is null. This reads as an in-progress column rename
(`importance` → `base_priority`) that was never fully completed with a cleanup migration — both
columns are kept in sync on write, but only one (`base_priority`) is truly read going forward.

**Business rule reflected in the schema:** the free-tier cap of 25 contacts per user
(`routes/contacts.ts`, `FREE_TIER_LIMIT`) is enforced in application code at insert time, not by a
database constraint.

## `user_settings`

One row per user (`user_id` is the primary key — a true 1:1, not a foreign key, for the same
reason as above).

| Column | Type | Default | Purpose |
|---|---|---|---|
| `user_id` | `text` PK | — | |
| `auto_downgrade_after_months` | `integer` NOT NULL | `6` | Months of no contact before a relationship auto-downgrades to a 180-day cadence (see `05-Business-Rules.md`) |
| `career_statement` | `text` NOT NULL | `''` | Free-text career goal statement; it is tokenized directly by the shared `@workspace/novara-priority` module and used in priority scoring |
| `goal_tags` | `text[]` NOT NULL | `'{}'` | Short-form goal tags |
| `career_goals` | `text[]` NOT NULL | `'{}'` | Structured career goals, merged with `goal_tags` and statement keywords |
| `has_seen_tutorial` | `boolean` NOT NULL | `false` | Onboarding-tour completion flag |
| `push_enabled` | `boolean` NOT NULL | `false` | |
| `notify_due_today` | `boolean` NOT NULL | `true` | |
| `notify_overdue` | `boolean` NOT NULL | `true` | |
| `notify_status_change` | `boolean` NOT NULL | `true` | |
| `notify_weekly_digest` | `boolean` NOT NULL | `false` | Column exists; no code path in `scheduler.ts` currently sends a weekly digest — see `15-Known-Issues.md` |
| `reminder_time` | `text` NOT NULL | `'09:00'` | Stored per-user, but the actual cron in `scheduler.ts` is hardcoded to run at `09:00 UTC` for everyone — this column does not currently affect when the job runs, only what's shown in Settings UI |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | `now()` | |

## `push_subscriptions`

One row per browser push subscription (a user can have multiple, e.g. multiple devices).

| Column | Type | Default | Purpose |
|---|---|---|---|
| `id` | `integer` PK, identity | auto | |
| `user_id` | `text` NOT NULL | — | |
| `endpoint` | `text` NOT NULL | — | The browser push service endpoint URL |
| `p256dh`, `auth` | `text` NOT NULL | — | Web Push encryption keys from the browser's `PushSubscription` |
| `created_at` | `timestamptz` NOT NULL | `now()` | |
| — | `UNIQUE (user_id, endpoint)` | | Upserted on re-subscribe (`ON CONFLICT (user_id, endpoint) DO UPDATE`) |

Rows are deleted automatically when a push send returns HTTP 410/404 ("gone" in `lib/push.ts`'s
return type), i.e. self-healing against stale/revoked browser subscriptions.

## `feedback`

The only table with a real Drizzle-managed schema and migration
(`lib/db/src/schema/feedback.ts`, `lib/db/drizzle/0000_steep_the_captain.sql`). In-app bug
reports and feature requests.

| Column | Type | Default | Purpose |
|---|---|---|---|
| `id` | `uuid` PK | `defaultRandom()` | |
| `user_id` | `text` NOT NULL | — | Clerk user ID of the submitter, from the verified session — never client-supplied |
| `type` | `text` NOT NULL | — | `bug` \| `feature` \| `general`, app-validated, not a DB enum (see rationale below) |
| `subject` | `text` NOT NULL | — | Max 200 chars, enforced in `routes/feedback.ts` |
| `description` | `text` NOT NULL | — | Max 5000 chars, enforced in `routes/feedback.ts` |
| `contact_email` | `text` | — | Optional, prefilled from Clerk but editable; explicitly documented as never used for auth |
| `may_contact` | `boolean` NOT NULL | `false` | |
| `page_url`, `user_agent`, `app_version` | `text` | — | Diagnostic context, bug reports only; explicitly no secrets/tokens/cookies per code comments |
| `status` | `text` NOT NULL | `'new'` | `new` \| `reviewing` \| `resolved` \| `closed` (per schema comment); nothing in the reviewed codebase transitions this — it's presumably updated manually/out-of-band |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | `now()` | |

**Why `type` and `status` are plain text, not Postgres enums:** the schema file's own comment
explains this is a deliberate convention shared with `contacts.importance`/`.status` — "kept as
free text ... to match the rest of this codebase's convention of plain text columns with
application-level validation ... rather than DB-level enums, so adding a new type never requires a
migration."

## Relationships

There are no foreign-key relationships between these four tables at the database level — every
cross-table reference (`contacts.user_id` ↔ `user_settings.user_id`, etc.) is an application-level
join on the Clerk `user_id` string, enforced by query logic, not by referential integrity
constraints. See `diagrams/database-erd.mmd` for the visual.

## Extensions

`pgcrypto` is enabled (`CREATE EXTENSION IF NOT EXISTS pgcrypto;` in `tests/schema.sql`) to
provide `gen_random_uuid()` for the `contacts` and `feedback` primary keys.

## Future expansion ideas (explicitly labeled as ideas, not commitments)

These are not found anywhere as a roadmap in the repository — they are natural extensions given the
current shape, offered here only as a starting point for a future engineer, not as planned work:

- A real migrations framework (e.g. extending the Drizzle setup already used for `feedback` to
  cover `contacts`, `user_settings`, and `push_subscriptions`) would close the biggest schema-safety
  gap described in `15-Known-Issues.md`.
- If `feedback.status` is meant to be actionable, an admin-facing route or dashboard to transition
  it would close the gap between the column's stated states and the total absence of any code path
  that changes it.
- The unused `notify_weekly_digest` and effectively-unused-per-user `reminder_time` columns
  suggest a partially-built feature (a configurable weekly digest / per-user reminder time) that
  never got a corresponding scheduler implementation.
