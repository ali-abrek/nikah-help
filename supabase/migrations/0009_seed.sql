-- 0009_seed.sql
-- Seed data for pricing plans

INSERT INTO public.pricing_plans (code, name_key, description_key, amount_kopecks, period_days)
VALUES ('subscription_monthly', 'pricing.monthly.name', 'pricing.monthly.description', 100000, 30)
ON CONFLICT (code) DO UPDATE SET
  amount_kopecks = EXCLUDED.amount_kopecks,
  period_days = EXCLUDED.period_days,
  updated_at = now();
