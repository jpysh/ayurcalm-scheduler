-- Alter enum to add therapy and patient types
ALTER TYPE "HolidayEntity" ADD VALUE IF NOT EXISTS 'therapy';
ALTER TYPE "HolidayEntity" ADD VALUE IF NOT EXISTS 'patient';
