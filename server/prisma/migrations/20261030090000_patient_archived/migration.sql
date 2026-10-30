-- A removed patient with a record is archived, not deleted (#1362).
ALTER TABLE "Patient" ADD COLUMN "archived_at" TIMESTAMP(3);
