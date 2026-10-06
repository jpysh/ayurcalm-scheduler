-- Medication and how to eat around treatment are the patient's, not the plan's (#355, decided 6 Oct).
ALTER TABLE "Patient" ADD COLUMN "medication" TEXT, ADD COLUMN "before_treatment" TEXT, ADD COLUMN "after_treatment" TEXT;
ALTER TABLE "DietTemplate" DROP COLUMN "medication", DROP COLUMN "pre_therapy_notes", DROP COLUMN "post_therapy_notes";
