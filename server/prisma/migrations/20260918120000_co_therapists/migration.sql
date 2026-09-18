-- Some treatments are worked by two therapists or more. The lead stays in
-- staff_id; everyone else on the treatment is listed beside it.
ALTER TABLE "Therapy" ADD COLUMN "staff_required" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Appointment" ADD COLUMN "co_staff_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
