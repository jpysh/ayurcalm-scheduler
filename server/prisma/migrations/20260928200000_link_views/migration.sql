ALTER TABLE "Patient" ADD COLUMN "link_token" TEXT;
CREATE UNIQUE INDEX "Patient_link_token_key" ON "Patient"("link_token");
ALTER TABLE "Staff" ADD COLUMN "link_token" TEXT;
CREATE UNIQUE INDEX "Staff_link_token_key" ON "Staff"("link_token");
ALTER TABLE "Therapy" ADD COLUMN "checklist" JSONB NOT NULL DEFAULT '[]', ADD COLUMN "vitals" TEXT[] DEFAULT ARRAY['bp']::TEXT[];
ALTER TABLE "Appointment" ADD COLUMN "record" JSONB;
CREATE TABLE "LinkIssue" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "appointment_id" TEXT,
  "kind" TEXT NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "seen" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "LinkIssue_pkey" PRIMARY KEY ("id")
);
