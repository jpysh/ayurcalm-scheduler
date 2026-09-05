-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "diet_plan" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "emergency_contact" TEXT,
ADD COLUMN     "emergency_phone" TEXT,
ADD COLUMN     "medical_notes" TEXT;

-- CreateTable
CREATE TABLE "PatientStay" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "duration_days" INTEGER NOT NULL,

    CONSTRAINT "PatientStay_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PatientStay" ADD CONSTRAINT "PatientStay_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
