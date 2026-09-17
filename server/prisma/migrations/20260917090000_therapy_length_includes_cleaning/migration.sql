-- A therapy has one length: hands-on time plus the room's cleaning time.
--
-- The buffer was a second number nobody could see — not in Therapies, not on the
-- day sheet — enforced by the scheduler and the replan but by nothing that
-- refuses a booking, so an edited appointment could sit inside another's
-- cleaning time and no screen said so.
--
-- Both tables move together, so every day already booked keeps the shape it had:
-- a treatment that used to block 60 minutes plus 15 of cleaning now blocks 75.
UPDATE "Appointment" a
SET "duration_minutes" = a."duration_minutes" + t."buffer_minutes"
FROM "Therapy" t
WHERE a."therapy_id" = t."id";

UPDATE "Therapy" SET "duration_minutes" = "duration_minutes" + "buffer_minutes";

ALTER TABLE "Therapy" DROP COLUMN "buffer_minutes";
