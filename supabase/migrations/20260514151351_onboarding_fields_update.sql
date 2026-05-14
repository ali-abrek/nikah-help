-- 20260514151351_onboarding_fields_update.sql
-- Update onboarding fields for new requirements

-- Change willing_to_relocate from boolean to text
-- Existing values: true → 'country' (reasonable default for "willing to relocate"),
-- false → 'none' (not willing)
ALTER TABLE public.profiles
  ALTER COLUMN willing_to_relocate TYPE text
  USING CASE
    WHEN willing_to_relocate = true THEN 'country'
    ELSE 'none'
  END;
