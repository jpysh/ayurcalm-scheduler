/*
  Warnings:

  - You are about to drop the column `template` on the `DietPlanSegment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DietPlanSegment" DROP COLUMN "template",
ADD COLUMN     "overrides" JSONB,
ADD COLUMN     "template_id" TEXT;

-- CreateTable
CREATE TABLE "DietTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "therapy_breakfast" TEXT NOT NULL DEFAULT '',
    "therapy_lunch" TEXT NOT NULL DEFAULT '',
    "therapy_dinner" TEXT NOT NULL DEFAULT '',
    "therapy_snacks" TEXT NOT NULL DEFAULT '',
    "rest_breakfast" TEXT NOT NULL DEFAULT '',
    "rest_lunch" TEXT NOT NULL DEFAULT '',
    "rest_dinner" TEXT NOT NULL DEFAULT '',
    "rest_snacks" TEXT NOT NULL DEFAULT '',
    "medication" TEXT,
    "pre_therapy_notes" TEXT,
    "post_therapy_notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DietTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DietTemplate_name_key" ON "DietTemplate"("name");

-- AddForeignKey
ALTER TABLE "DietPlanSegment" ADD CONSTRAINT "DietPlanSegment_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "DietTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
