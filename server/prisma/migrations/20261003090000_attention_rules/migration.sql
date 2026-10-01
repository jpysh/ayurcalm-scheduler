-- #288: which rules put something on the pill (only the ones the admin changed), and which setup items were reviewed.
ALTER TABLE "Settings" ADD COLUMN "attention_rules" JSONB;
ALTER TABLE "Settings" ADD COLUMN "setup_reviewed" TEXT[] DEFAULT ARRAY[]::TEXT[];
