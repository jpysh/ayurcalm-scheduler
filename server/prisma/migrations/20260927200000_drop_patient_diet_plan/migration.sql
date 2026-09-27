-- Every resident's diet is a plan segment; this label duplicated it (#191).
ALTER TABLE "Patient" DROP COLUMN "diet_plan";
