ALTER TABLE "Settings" ADD COLUMN "letterhead" JSONB;
ALTER TABLE "Staff" ADD COLUMN "qualification" TEXT, ADD COLUMN "reg_no" TEXT, ADD COLUMN "signature" TEXT;
ALTER TABLE "PatientStay" ADD COLUMN "discharge" JSONB;
