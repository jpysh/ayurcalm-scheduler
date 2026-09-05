-- CreateTable
CREATE TABLE "DietPlanSegment" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "template" JSONB,
    "template_label" TEXT,
    "therapy_ids" TEXT[],
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DietPlanSegment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DietPlanSegment" ADD CONSTRAINT "DietPlanSegment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
