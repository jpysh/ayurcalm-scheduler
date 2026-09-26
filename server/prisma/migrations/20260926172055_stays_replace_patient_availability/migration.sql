/*
  Warnings:

  - You are about to drop the column `available_from` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `available_to` on the `Patient` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "available_from",
DROP COLUMN "available_to";
