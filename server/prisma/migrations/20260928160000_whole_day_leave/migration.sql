-- Whole-day leave used to be saved as 09:00-18:00, which left early and late
-- hours bookable. No hours means the whole day.
UPDATE "Holiday" SET start_time = NULL, end_time = NULL WHERE start_time = '09:00' AND end_time = '18:00';
