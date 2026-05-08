-- Grant Data API access to geonames tables (required for anon/public access)
GRANT SELECT ON public.geonames_countries TO anon, authenticated;
GRANT SELECT ON public.geonames_cities TO anon, authenticated;
