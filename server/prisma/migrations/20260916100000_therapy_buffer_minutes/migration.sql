-- Rest for the patient and cleanup for the room after a therapy. Existing rows
-- keep 0, so a centre already running sees no change until it sets its own.
ALTER TABLE "Therapy" ADD COLUMN "buffer_minutes" INTEGER NOT NULL DEFAULT 0;
