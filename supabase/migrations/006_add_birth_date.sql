-- Add birth_date column; keep birth_year for backward compatibility
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date date null;
