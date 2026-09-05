-- Manual migration to extend Holiday for ranges, intra-day times, and weekly recurrence
ALTER TABLE "Holiday" ADD COLUMN IF NOT EXISTS "start_date" TIMESTAMP NULL;
ALTER TABLE "Holiday" ADD COLUMN IF NOT EXISTS "end_date" TIMESTAMP NULL;
ALTER TABLE "Holiday" ADD COLUMN IF NOT EXISTS "start_time" TEXT NULL;
ALTER TABLE "Holiday" ADD COLUMN IF NOT EXISTS "end_time" TEXT NULL;
ALTER TABLE "Holiday" ADD COLUMN IF NOT EXISTS "recurrence" TEXT NULL;
ALTER TABLE "Holiday" ADD COLUMN IF NOT EXISTS "weekdays" TEXT[] NULL;
