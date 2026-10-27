-- One Network Health score per user per day, so the Dashboard can show how
-- the score moved ("+12 vs last month").
--
-- The score is the same one the app shows: the average over a user's
-- connected contacts of 100 (follow-up not yet due), 60 (1-30 days overdue),
-- 20 (31-90 days) or 0 (more than 90 days). It is written by a nightly job for
-- every user and again whenever a user opens the Dashboard.
--
-- Additive and safe to apply while the app is running. The code checks for
-- this table with to_regclass and simply records nothing (and shows no trend)
-- when it is absent, so it does not matter whether this runs before or after
-- the deploy.
--
-- Size: one small row per user per day, roughly 40 bytes; a year for 10,000
-- users is about 150 MB before compression.
CREATE TABLE IF NOT EXISTS network_health_snapshots (
    user_id       text    NOT NULL,
    snapshot_date date    NOT NULL,
    score         integer NOT NULL CHECK (score BETWEEN 0 AND 100),
    PRIMARY KEY (user_id, snapshot_date)
);
