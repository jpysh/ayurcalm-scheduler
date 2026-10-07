-- Form C (#415): a foreign guest's visa, and when each stay's Form C was filed.
ALTER TABLE "Patient" ADD COLUMN "visa_number" TEXT, ADD COLUMN "visa_valid_until" TEXT;
ALTER TABLE "PatientStay" ADD COLUMN "form_c_filed" TIMESTAMP(3);
