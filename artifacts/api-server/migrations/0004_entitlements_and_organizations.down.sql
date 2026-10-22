-- Reverses 0004_entitlements_and_organizations.sql.
--
-- Destroys all university organization, membership, invitation and
-- university-entitlement data. Export the rows first. Only run with
-- UNIVERSITY_ACCESS_ENABLED unset or false.

BEGIN;
DROP TABLE IF EXISTS entitlements;
DROP TABLE IF EXISTS organization_invitations;
DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS organizations;
COMMIT;
