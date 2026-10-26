-- A companion stays and eats but takes no treatments (#1195).
ALTER TABLE "PatientStay" ADD COLUMN "companion" BOOLEAN NOT NULL DEFAULT false;
