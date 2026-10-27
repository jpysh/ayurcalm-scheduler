-- Guest room tags (#1201).
ALTER TABLE "GuestRoom" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
