-- #285 stories 10-12: the centre's package and accommodation catalogues (reference, not billing),
-- what a stay chose from them, and why a treatment was cancelled.
CREATE TABLE "Package" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "days" INTEGER NOT NULL,
  "price" INTEGER NOT NULL,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Package_name_key" ON "Package"("name");

CREATE TABLE "AccommodationType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price_per_day" INTEGER NOT NULL,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "AccommodationType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccommodationType_name_key" ON "AccommodationType"("name");

ALTER TABLE "PatientStay" ADD COLUMN "package_id" TEXT, ADD COLUMN "accommodation_id" TEXT, ADD COLUMN "room_number" TEXT;
ALTER TABLE "PatientStay" ADD CONSTRAINT "PatientStay_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientStay" ADD CONSTRAINT "PatientStay_accommodation_id_fkey" FOREIGN KEY ("accommodation_id") REFERENCES "AccommodationType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Appointment" ADD COLUMN "cancel_reason" TEXT;
