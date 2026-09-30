ALTER TABLE "Patient" ADD COLUMN "address" TEXT, ADD COLUMN "country" TEXT, ADD COLUMN "id_number" TEXT, ADD COLUMN "registration_number" TEXT;
ALTER TABLE "PatientStay" ADD COLUMN "on_site" BOOLEAN NOT NULL DEFAULT true;
