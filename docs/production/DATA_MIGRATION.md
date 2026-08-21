# Data Migration Plan — Pilot → Production

**Status: PLAN ONLY. No data is migrated until Cloe approves exact SQL.** The
executable draft is `sql/data_migration_DRAFT.sql`.

## The core constraint
Production runs a **new Clerk instance**, so every user's `user_id` changes.
Every table keys on `user_id` (`contacts`, `user_settings`, `push_subscriptions`).
Rows must be **remapped**, not copied verbatim.

## Recommended approach — "selected users, re-signup + remap"
1. **Choose** which pilot users to bring over (not "all").
2. Each chosen user **signs up in production** (Clerk prod) → new `user_id`.
3. Build a `user_id_map` (pilot_user_id → prod_user_id) by hand or CSV.
4. **Export** only those users' rows from the pilot DB (read-only `\copy`).
5. **Load → remap → insert** into production (staging tables + join on the map).
6. **Verify** counts; leave pilot untouched as the rollback source.

## What to migrate
- ✅ `contacts` — yes (the user's real data).
- ✅ `user_settings` — yes (`ON CONFLICT DO NOTHING` so it won't clobber prod-created settings).
- ⚠️ `push_subscriptions` — usually **no**; device/endpoint-bound, users re-enable push in prod.
- ❌ `feedback` — no; historical support data, not user-facing.

## Guardrails
- The draft SQL only ever **reads** from pilot and **inserts** into production. No UPDATE/DELETE on pilot.
- New `contacts.id` UUIDs are generated on insert to avoid any collision.
- Dry-run on a throwaway Neon branch first; compare counts before touching real production.

## Approval gate
Before any execution, Cloe reviews and signs off on:
1. The exact list of migrated users + the `user_id_map`.
2. The final SQL (after filling placeholders).
3. The dry-run counts.
