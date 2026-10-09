-- Regular absence belongs in the thing's own hours (#695); time off is a date or a range.
ALTER TABLE "Holiday" DROP COLUMN "recurrence",
DROP COLUMN "weekdays";
