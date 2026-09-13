-- Keep the newest entry where a patient has more than one for the same meal on
-- the same day; the sheet could only ever print one of them.
DELETE FROM "DietPlan" a USING "DietPlan" b
WHERE a.patient_id = b.patient_id AND a.date = b.date AND a.meal_time = b.meal_time
  AND (a.created_at, a.id) < (b.created_at, b.id);

CREATE UNIQUE INDEX "DietPlan_patient_id_date_meal_time_key" ON "DietPlan"("patient_id", "date", "meal_time");
