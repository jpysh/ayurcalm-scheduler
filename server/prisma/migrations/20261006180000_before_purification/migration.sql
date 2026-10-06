ALTER TABLE "Therapy" ADD COLUMN "before_purification" BOOLEAN NOT NULL DEFAULT false;
-- Snehapana prepares for Vamana or Virechana (#375), in centres that already have it.
UPDATE "Therapy" SET "before_purification" = true WHERE lower("name") = 'snehapana';
