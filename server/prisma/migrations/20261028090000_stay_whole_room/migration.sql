-- A double let as a single (#1253).
ALTER TABLE "PatientStay" ADD COLUMN "whole_room" BOOLEAN NOT NULL DEFAULT false;
