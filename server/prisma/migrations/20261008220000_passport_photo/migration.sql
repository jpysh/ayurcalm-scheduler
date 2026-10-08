-- A photo of the guest's passport or ID, kept apart from the patient (#510).
CREATE TABLE "PatientPhoto" (
    "patient_id" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPhoto_pkey" PRIMARY KEY ("patient_id")
);

ALTER TABLE "PatientPhoto" ADD CONSTRAINT "PatientPhoto_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
