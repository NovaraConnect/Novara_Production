-- Minimal schema for backend tests. Mirrors the columns actually read/written
-- by artifacts/api-server/src/routes/*.ts and artifacts/api-server/src/db.ts.
-- This is NOT a migrations framework (the app has none in production either —
-- see ARCHITECTURE.md) — it exists solely to give the test Postgres service
-- container something real to talk to.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS contacts (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id text NOT NULL,
first_name text NOT NULL,
last_name text NOT NULL,
linkedin_url text,
company text NOT NULL,
role text,
met_at text,
importance text NOT NULL DEFAULT 'Medium',
base_priority text NOT NULL DEFAULT 'Medium',
current_priority text NOT NULL DEFAULT 'Medium',
priority_override boolean NOT NULL DEFAULT false,
industry text,
function text,
interests text[] NOT NULL DEFAULT '{}',
initial_follow_up_days integer NOT NULL DEFAULT 7,
follow_up_cadence_days integer NOT NULL DEFAULT 42,
cadence_override boolean NOT NULL DEFAULT false,
goal_tags text[] NOT NULL DEFAULT '{}',
connection_status text NOT NULL DEFAULT 'connected',
first_contact_date date NOT NULL DEFAULT CURRENT_DATE,
last_interaction_date date NOT NULL DEFAULT CURRENT_DATE,
next_follow_up_date date NOT NULL DEFAULT CURRENT_DATE,
notes text,
email text,
phone text,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
user_id text PRIMARY KEY,
auto_downgrade_after_months integer NOT NULL DEFAULT 6,
career_statement text NOT NULL DEFAULT '',
goal_tags text[] NOT NULL DEFAULT '{}',
career_goals text[] NOT NULL DEFAULT '{}',
has_seen_tutorial boolean NOT NULL DEFAULT false,
push_enabled boolean NOT NULL DEFAULT false,
notify_due_today boolean NOT NULL DEFAULT true,
notify_overdue boolean NOT NULL DEFAULT true,
notify_status_change boolean NOT NULL DEFAULT true,
notify_weekly_digest boolean NOT NULL DEFAULT false,
reminder_time text NOT NULL DEFAULT '09:00',
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
user_id text NOT NULL,
endpoint text NOT NULL,
p256dh text NOT NULL,
auth text NOT NULL,
created_at timestamptz NOT NULL DEFAULT now(),
UNIQUE (user_id, endpoint)
);

-- Mirrors lib/db/src/schema/feedback.ts / lib/db/drizzle/0000_steep_the_captain.sql,
-- which is the reproducible migration already applied to production.
CREATE TABLE IF NOT EXISTS feedback (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id text NOT NULL,
type text NOT NULL,
subject text NOT NULL,
description text NOT NULL,
contact_email text,
may_contact boolean NOT NULL DEFAULT false,
page_url text,
user_agent text,
app_version text,
status text NOT NULL DEFAULT 'new',
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);
