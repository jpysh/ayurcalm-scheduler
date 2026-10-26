-- A guest moved mid-stay keeps their past nights in the room they slept in (#1164).
CREATE TABLE "EarlierGuestRoom" (
    "id" TEXT NOT NULL,
    "stay_id" TEXT NOT NULL,
    "guest_room_id" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EarlierGuestRoom_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EarlierGuestRoom_stay_id_idx" ON "EarlierGuestRoom"("stay_id");
ALTER TABLE "EarlierGuestRoom" ADD CONSTRAINT "EarlierGuestRoom_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "PatientStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EarlierGuestRoom" ADD CONSTRAINT "EarlierGuestRoom_guest_room_id_fkey" FOREIGN KEY ("guest_room_id") REFERENCES "GuestRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
