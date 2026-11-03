-- Every contact list, count and notification lookup filters by user_id, but the
-- live table has only its primary key, so each one reads the whole table.
-- docs/production/schema/production_schema.sql already declares this index.
--
-- CONCURRENTLY does not lock out writes, and it cannot run inside a transaction:
-- run this file on its own, with autocommit on.
CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_user_id_idx ON contacts (user_id);
