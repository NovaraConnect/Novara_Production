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
preferred_contact_method text,
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

CREATE TABLE IF NOT EXISTS apns_tokens (
id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
user_id text NOT NULL,
device_token text NOT NULL,
environment text NOT NULL DEFAULT 'production',
created_at timestamptz NOT NULL DEFAULT now(),
UNIQUE (user_id, device_token)
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

-- University access (migration 0004). Mirrors migrations/0004_entitlements_and_organizations.sql.
--
--
--


CREATE TABLE IF NOT EXISTS organizations (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name               text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    status             text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'suspended')),
    -- Commercial metadata for contract reporting and renewal conversations.
    -- Never read by any access check: universities have unlimited students.
    licensed_enrollment integer NULL CHECK (licensed_enrollment IS NULL OR licensed_enrollment >= 0),
    -- Optional contract end. NULL means no end date.
    access_ends_at     timestamptz NULL,
    created_by_user_id text NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         text NOT NULL,
    role            text NOT NULL CHECK (role IN ('admin', 'member')),
    status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'revoked')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    revoked_at      timestamptz NULL,
    CONSTRAINT organization_members_one_row UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_members_user_active_idx
    ON organization_members (user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS organization_invitations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- Always stored lowercased; matching is exact after normalization.
    email               text NOT NULL CHECK (email = lower(email)),
    role                text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    -- SHA-256 hex of the raw token. The raw token is never stored.
    token_hash          text NOT NULL UNIQUE,
    status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    expires_at          timestamptz NOT NULL,
    invited_by_user_id  text NOT NULL,
    accepted_by_user_id text NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    accepted_at         timestamptz NULL
);
CREATE INDEX IF NOT EXISTS organization_invitations_org_status_idx
    ON organization_invitations (organization_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_one_pending
    ON organization_invitations (organization_id, email) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS entitlements (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         text NOT NULL,
    source          text NOT NULL CHECK (source IN ('university', 'apple_iap', 'stripe')),
    organization_id uuid NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_ref    text NULL,
    product_id      text NULL,
    status          text NOT NULL CHECK (status IN ('active', 'inactive')),
    expires_at      timestamptz NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT entitlements_university_has_org CHECK (
        source <> 'university' OR organization_id IS NOT NULL
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_university_one_row
    ON entitlements (user_id, organization_id) WHERE source = 'university';
CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements (user_id);

