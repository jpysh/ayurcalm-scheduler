-- #393: a residential centre treats every day. "Open on" was never enforced before this,
-- so every install has in fact been open seven days; this keeps it so now that it is.
ALTER TABLE "Settings" ALTER COLUMN "working_days" SET DEFAULT ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']::TEXT[];
UPDATE "Settings" SET "working_days" = ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']::TEXT[];
