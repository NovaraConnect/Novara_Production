-- University organizations, invitations and a provider-neutral
-- entitlements table.
--
-- Additive only: creates four new tables and touches no existing table.
-- Nothing reads these tables unless UNIVERSITY_ACCESS_ENABLED=true, so this
-- migration is safe to apply before the feature ships.
--
-- User IDs are Clerk user IDs (text), matching the existing tables.
-- Migration numbering: 0004 on main. The feat/stripe branch's
-- 0004_subscriptions.sql must be renumbered when that branch is rebased.
--
-- Hand-applied (no migration runner in this repo). Apply in a transaction.

BEGIN;

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
-- At most one live invitation per organization and address. Duplicate
-- creates fail on this index (SQLSTATE 23505) and the route maps that to 409.
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_one_pending
    ON organization_invitations (organization_id, email) WHERE status = 'pending';

-- Provider-neutral. 'apple_iap' and 'stripe' are reserved for later phases;
-- nothing writes them in this release.
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

COMMIT;
