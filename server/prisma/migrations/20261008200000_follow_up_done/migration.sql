-- When the admin marked the follow-up after discharge as done (#487).
ALTER TABLE "PatientStay" ADD COLUMN "follow_up_done" TIMESTAMP(3);
