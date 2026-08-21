-- =============================================================================
-- Novara — PILOT -> PRODUCTION data migration  (DRAFT — DO NOT EXECUTE)
-- =============================================================================
-- STATUS: draft for review. Nothing here runs until Cloe approves exact SQL.
--
-- Why this is non-trivial: PRODUCTION uses a NEW Clerk instance, so every
-- user's Clerk user_id (the `user_id text` column on every table) is DIFFERENT
-- from the pilot. Rows cannot be copied verbatim — user_id must be remapped.
--
-- Recommended flow (selected users only, never "all"):
--   1. Chosen pilot users sign up in PRODUCTION (Clerk prod) -> new user_ids.
--   2. Build user_id_map (pilot_user_id -> prod_user_id) by hand/CSV.
--   3. Export ONLY those users' rows from pilot (pg_dump --data-only or \copy).
--   4. Load into prod staging tables (schema below), remap, insert.
--   5. Verify counts, then keep pilot untouched as the rollback source.
-- =============================================================================

-- STEP 0 (on PILOT, read-only export). Run per selected user; writes CSV locally.
--   \copy (SELECT * FROM contacts          WHERE user_id = :'pilot_uid') TO 'contacts_<u>.csv'          CSV HEADER;
--   \copy (SELECT * FROM user_settings      WHERE user_id = :'pilot_uid') TO 'user_settings_<u>.csv'      CSV HEADER;
--   \copy (SELECT * FROM push_subscriptions WHERE user_id = :'pilot_uid') TO 'push_subscriptions_<u>.csv' CSV HEADER;
-- (push_subscriptions are device-bound; usually DO NOT migrate — users re-enable push in prod.)

-- ============================ everything below runs on PRODUCTION =============

-- STEP 1. user_id remap table. Fill one row per migrated user.
CREATE TEMP TABLE user_id_map (
    pilot_user_id text PRIMARY KEY,
    prod_user_id  text NOT NULL
);
-- INSERT INTO user_id_map (pilot_user_id, prod_user_id) VALUES
--   ('user_PILOT_abc123', 'user_PROD_xyz789'),
--   ('user_PILOT_def456', 'user_PROD_uvw012');

-- STEP 2. Staging tables mirroring the pilot columns exactly.
CREATE TEMP TABLE stg_contacts      (LIKE public.contacts      INCLUDING DEFAULTS);
CREATE TEMP TABLE stg_user_settings (LIKE public.user_settings INCLUDING DEFAULTS);

-- STEP 3. Load the CSVs exported in STEP 0 into the staging tables.
--   \copy stg_contacts      FROM 'contacts_<u>.csv'      CSV HEADER;
--   \copy stg_user_settings FROM 'user_settings_<u>.csv'  CSV HEADER;

-- STEP 4. Insert into production with remapped user_id.
-- Guard with the map so only mapped users are migrated. New id for contacts to
-- avoid any pk collision; user_settings keeps user_id as its PK (remapped).
INSERT INTO public.contacts (
    id, user_id, first_name, last_name, linkedin_url, company, role, met_at,
    importance, initial_follow_up_days, follow_up_cadence_days,
    first_contact_date, last_interaction_date, next_follow_up_date, notes,
    created_at, updated_at, email, phone, goal_tags, connection_status,
    base_priority, current_priority, priority_override, industry, function, interests
)
SELECT
    gen_random_uuid(), m.prod_user_id, s.first_name, s.last_name, s.linkedin_url,
    s.company, s.role, s.met_at, s.importance, s.initial_follow_up_days,
    s.follow_up_cadence_days, s.first_contact_date, s.last_interaction_date,
    s.next_follow_up_date, s.notes, s.created_at, s.updated_at, s.email, s.phone,
    s.goal_tags, s.connection_status, s.base_priority, s.current_priority,
    s.priority_override, s.industry, s.function, s.interests
FROM stg_contacts s
JOIN user_id_map m ON m.pilot_user_id = s.user_id;

INSERT INTO public.user_settings (
    user_id, auto_downgrade_after_months, career_statement, goal_tags,
    created_at, updated_at, push_enabled, notify_due_today, notify_overdue,
    notify_status_change, notify_weekly_digest, reminder_time, has_seen_tutorial, career_goals
)
SELECT
    m.prod_user_id, s.auto_downgrade_after_months, s.career_statement, s.goal_tags,
    s.created_at, s.updated_at, s.push_enabled, s.notify_due_today, s.notify_overdue,
    s.notify_status_change, s.notify_weekly_digest, s.reminder_time, s.has_seen_tutorial, s.career_goals
FROM stg_user_settings s
JOIN user_id_map m ON m.pilot_user_id = s.user_id
ON CONFLICT (user_id) DO NOTHING;   -- do not clobber settings a prod user already created

-- STEP 5. Verify (expected counts = rows in staging that had a mapping).
-- SELECT count(*) FROM public.contacts      WHERE user_id IN (SELECT prod_user_id FROM user_id_map);
-- SELECT count(*) FROM public.user_settings WHERE user_id IN (SELECT prod_user_id FROM user_id_map);

-- NOTHING in this file deletes or updates pilot data. Pilot remains the rollback source.
