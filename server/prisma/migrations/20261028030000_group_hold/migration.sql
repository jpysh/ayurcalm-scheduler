-- Rooms held for a group (#1196).
CREATE TABLE "GroupHold" (
    "id" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "accommodation_id" TEXT NOT NULL,
    "rooms" INTEGER NOT NULL,
    CONSTRAINT "GroupHold_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GroupHold_group_name_accommodation_id_key" ON "GroupHold"("group_name", "accommodation_id");
ALTER TABLE "GroupHold" ADD CONSTRAINT "GroupHold_accommodation_id_fkey" FOREIGN KEY ("accommodation_id") REFERENCES "AccommodationType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
