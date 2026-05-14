-- 20260514160000_align_profile_check_constraints.sql
-- Align profiles CHECK constraints with current application schema.
--
-- Mismatches caused PostgreSQL 23514 (check_violation) on onboarding step 2,
-- which handleActionError mapped to VALIDATION_INVALID_INPUT, surfacing
-- "Проверьте правильность заполнения полей" to users.
--
--   housing:        app sends {rent, apartment, house, parents};
--                   old check allowed {own, rent, parents, shared}.
--   hijab_attitude: app sends {no_hijab, hijab, niqab};
--                   old check allowed {niqab, hijab_full, hijab_partial, no_hijab}.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_housing;
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_housing CHECK (
    housing IS NULL OR housing IN ('rent', 'apartment', 'house', 'parents')
  ) NOT VALID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_hijab_attitude;
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_hijab_attitude CHECK (
    hijab_attitude IS NULL OR hijab_attitude IN ('no_hijab', 'hijab', 'niqab')
  ) NOT VALID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_willing_to_relocate;
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_willing_to_relocate CHECK (
    willing_to_relocate IS NULL OR willing_to_relocate IN ('none', 'region', 'country', 'abroad')
  ) NOT VALID;
