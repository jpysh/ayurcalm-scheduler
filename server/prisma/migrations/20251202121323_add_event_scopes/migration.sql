-- AlterTable
ALTER TABLE "ProgramEvent" ADD COLUMN     "patient_ids" TEXT[],
ADD COLUMN     "patients_scope" TEXT,
ADD COLUMN     "staff_ids" TEXT[],
ADD COLUMN     "staff_scope" TEXT;
