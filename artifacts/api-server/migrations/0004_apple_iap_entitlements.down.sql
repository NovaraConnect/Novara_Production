-- Reverses 0004_apple_iap_entitlements.sql.
--
-- Destroys all entitlement rows and the RevenueCat event log. Export first.
-- Only run after the API that reads `entitlements` has been rolled back.

BEGIN;
DROP TABLE IF EXISTS revenuecat_events;
DROP TABLE IF EXISTS entitlements;
COMMIT;
