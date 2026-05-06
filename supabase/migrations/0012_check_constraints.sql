-- 0012_check_constraints.sql
-- Add CHECK constraints to profile enum-like text columns
-- so bad data can't enter through admin operations or direct API calls.

-- marital_status
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_marital_status CHECK (
    marital_status IS NULL OR marital_status IN (
      'single', 'divorced', 'widowed', 'married_1', 'married_2', 'married_3'
    )
  ) NOT VALID;

-- education
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_education CHECK (
    education IS NULL OR education IN (
      'none', 'school', 'vocational', 'bachelor', 'master', 'phd'
    )
  ) NOT VALID;

-- income_level (male only)
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_income_level CHECK (
    income_level IS NULL OR income_level IN ('low', 'middle', 'high')
  ) NOT VALID;

-- housing (male only)
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_housing CHECK (
    housing IS NULL OR housing IN ('own', 'rent', 'parents', 'shared')
  ) NOT VALID;

-- polygyny_attitude (female only)
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_polygyny_attitude CHECK (
    polygyny_attitude IS NULL OR polygyny_attitude IN ('positive', 'neutral', 'negative')
  ) NOT VALID;

-- hijab_attitude (female only)
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_hijab_attitude CHECK (
    hijab_attitude IS NULL OR hijab_attitude IN (
      'niqab', 'hijab_full', 'hijab_partial', 'no_hijab'
    )
  ) NOT VALID;
