-- One setting only: the preferred therapist is the first choice everywhere (#1043).
ALTER TABLE "Patient" DROP COLUMN "requires_preferred_staff";
