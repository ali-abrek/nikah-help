-- seed.sql
-- Development seed data

INSERT INTO public.pricing_plans (code, name_key, description_key, amount_kopecks, period_days)
VALUES ('subscription_monthly', 'pricing.monthly.name', 'pricing.monthly.description', 100000, 30)
ON CONFLICT (code) DO NOTHING;
