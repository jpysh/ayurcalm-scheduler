-- #330: soft daily limit per resident.
ALTER TABLE "Settings" ADD COLUMN "max_treatments_per_day" INTEGER NOT NULL DEFAULT 4;
