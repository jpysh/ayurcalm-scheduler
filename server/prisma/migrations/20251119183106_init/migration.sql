-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'rescheduled');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "HolidayEntity" AS ENUM ('center', 'staff', 'room');

-- CreateEnum
CREATE TYPE "MealTime" AS ENUM ('breakfast', 'lunch', 'dinner', 'snacks');

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "specializations" TEXT[],
    "phone" TEXT,
    "weekly_schedule" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapyRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amenities" TEXT[],
    "weekly_schedule" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TherapyRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Therapy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required_amenities" TEXT[],
    "duration_minutes" INTEGER NOT NULL,
    "requires_gender_match" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,

    CONSTRAINT "Therapy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "therapy_id" TEXT NOT NULL,
    "staff_id" TEXT,
    "room_id" TEXT,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "session_number" INTEGER NOT NULL,
    "total_sessions" INTEGER NOT NULL,
    "status" "AppointmentStatus" NOT NULL,
    "assignment_type" "AssignmentType" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "entity_type" "HolidayEntity" NOT NULL,
    "entity_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DietPlan" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "meal_time" "MealTime" NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DietPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_therapy_id_fkey" FOREIGN KEY ("therapy_id") REFERENCES "Therapy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "TherapyRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DietPlan" ADD CONSTRAINT "DietPlan_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
