-- HRV (RMSSD) is a physical measurement that can be a decimal value (e.g., 45.7 ms).
-- Changing from integer to numeric so the profiles upsert never rejects a valid decimal.
alter table public.profiles
  alter column normal_hrv type numeric using normal_hrv::numeric;
