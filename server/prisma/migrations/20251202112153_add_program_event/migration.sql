-- AlterTable
ALTER TABLE "Holiday" ALTER COLUMN "date" DROP NOT NULL,
ALTER COLUMN "start_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "end_date" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProgramEvent" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "activity_name" TEXT NOT NULL,
    "location" TEXT,
    "leader" TEXT,
    "notes" TEXT,
    "recurrence" TEXT,
    "weekdays" TEXT[],
    "audience" TEXT,

    CONSTRAINT "ProgramEvent_pkey" PRIMARY KEY ("id")
);
