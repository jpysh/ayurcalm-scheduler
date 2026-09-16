-- AlterTable
ALTER TABLE "Settings" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Kolkata';

-- The install that is already running was created with the old UTC default.
-- There are no production installs to protect, and a centre left on UTC prints
-- the wrong day's sheet after 18:30 local time.
UPDATE "Settings" SET "timezone" = 'Asia/Kolkata' WHERE "timezone" = 'UTC';
