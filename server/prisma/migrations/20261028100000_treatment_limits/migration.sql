-- What the doctor ruled out for a guest (#1254).
ALTER TABLE "Patient" ADD COLUMN "treatment_limits" JSONB;
