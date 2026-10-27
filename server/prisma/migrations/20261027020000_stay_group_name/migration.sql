-- A group booking by its name (#1196).
ALTER TABLE "PatientStay" ADD COLUMN "group_name" TEXT;
CREATE INDEX "PatientStay_group_name_idx" ON "PatientStay"("group_name");
