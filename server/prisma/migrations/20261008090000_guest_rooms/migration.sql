-- Guest rooms (#456): the rooms patients sleep in, each of one accommodation type.
CREATE TABLE "GuestRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accommodation_id" TEXT NOT NULL,
    "beds" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "GuestRoom_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuestRoom_name_key" ON "GuestRoom"("name");
ALTER TABLE "GuestRoom" ADD CONSTRAINT "GuestRoom_accommodation_id_fkey" FOREIGN KEY ("accommodation_id") REFERENCES "AccommodationType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientStay" ADD COLUMN "guest_room_id" TEXT;
ALTER TABLE "PatientStay" ADD CONSTRAINT "PatientStay_guest_room_id_fkey" FOREIGN KEY ("guest_room_id") REFERENCES "GuestRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
