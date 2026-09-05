-- Staging Database Anonymization Script
-- Run after loading production data dump

-- Anonymize patient names
UPDATE "Patient" SET 
    name = 'Patient ' || id::text,
    email = 'patient' || id::text || '@example.com',
    phone = '555-' || substr(id::text, 1, 3) || '-' || substr(id::text, 5, 4);

-- Anonymize staff names  
UPDATE "Staff" SET
    name = 'Staff ' || id::text,
    phone = '555-' || substr(id::text, 1, 3) || '-' || substr(id::text, 5, 4);

-- Clear medical notes
UPDATE "Patient" SET
    medical_notes = 'STAGING DATA - NOT REAL',
    emergency_contact = 'Staging Contact',
    emergency_phone = '555-0000';

-- Clear real email addresses
UPDATE "Patient" SET
    email = REPLACE(email, '@', '+staging@')
WHERE email LIKE '%@%' AND email NOT LIKE '%example.com';

-- Verify anonymization
SELECT count(*) as patients_anonymized FROM "Patient" WHERE name LIKE 'Patient %';
SELECT count(*) as staff_anonymized FROM "Staff" WHERE name LIKE 'Staff %';