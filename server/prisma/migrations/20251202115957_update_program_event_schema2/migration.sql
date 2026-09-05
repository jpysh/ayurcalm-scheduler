/*
  Warnings:

  - You are about to drop the column `leader` on the `ProgramEvent` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `ProgramEvent` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ProgramEvent" DROP COLUMN "leader",
DROP COLUMN "location",
ADD COLUMN     "end_date" TIMESTAMP(3),
ADD COLUMN     "required_amenities" TEXT[],
ADD COLUMN     "room_id" TEXT,
ADD COLUMN     "staff_id" TEXT,
ADD COLUMN     "start_date" TIMESTAMP(3);
