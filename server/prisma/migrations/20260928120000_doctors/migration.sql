ALTER TABLE "Staff" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'therapist';
ALTER TABLE "Therapy" ADD COLUMN "is_consultation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Patient" ADD COLUMN "doctor_plan" TEXT;
