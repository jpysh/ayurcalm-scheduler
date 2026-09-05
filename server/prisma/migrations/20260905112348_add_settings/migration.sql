-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "centre_name" TEXT NOT NULL DEFAULT 'Wellness Centre',
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "opening_time" TEXT NOT NULL DEFAULT '09:00',
    "closing_time" TEXT NOT NULL DEFAULT '18:00',
    "slot_minutes" INTEGER NOT NULL DEFAULT 30,
    "working_days" TEXT[] DEFAULT ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday']::TEXT[],
    "logo" TEXT,
    "demo_data" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);
