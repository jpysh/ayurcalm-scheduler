-- The day a guest room was made up after a guest left (#1199).
ALTER TABLE "GuestRoom" ADD COLUMN "ready_on" TIMESTAMP(3);
