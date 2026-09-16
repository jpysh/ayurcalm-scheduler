-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "preferred_staff_id" TEXT,
ADD COLUMN     "requires_preferred_staff" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProgramEvent" ADD COLUMN     "is_optional" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "enforce_gender_match" BOOLEAN NOT NULL DEFAULT true;
