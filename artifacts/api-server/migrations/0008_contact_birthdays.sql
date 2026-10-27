-- Optional birthday per contact, and a notification setting for it.
--
-- `birthday` is the month and day only, as ISO 8601 "--MM-DD" (Novara doesn't
-- ask for the year). Stored as text because a date column would need a
-- made-up year.
--
-- `notify_birthdays` drives a "It's Sarah's birthday today" push from the
-- daily notification job; on by default, like the other reminders.
--
-- Numbered 0008 because 0007 is taken by the Apple IAP work (PR #28).
-- Additive and safe to apply while the app is running: the code checks for the
-- column and ignores birthdays until it exists.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birthday text
    CHECK (birthday IS NULL OR birthday ~ '^--\d{2}-\d{2}$');
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_birthdays boolean NOT NULL DEFAULT true;
