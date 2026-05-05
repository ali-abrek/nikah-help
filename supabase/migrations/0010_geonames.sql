-- 0010_geonames.sql
-- Geonames countries and cities tables for location autocomplete

-- ============================================================
-- geonames_countries
-- ============================================================
CREATE TABLE public.geonames_countries (
  iso2         char(2) PRIMARY KEY,
  iso3         char(3),
  name_en      text NOT NULL,
  name_ru      text,
  phone_prefix text,
  is_cis       boolean DEFAULT false
);

ALTER TABLE public.geonames_countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_countries" ON geonames_countries FOR SELECT USING (true);

-- ============================================================
-- geonames_cities
-- ============================================================
CREATE TABLE public.geonames_cities (
  id           integer PRIMARY KEY,
  name         text NOT NULL,
  ascii_name   text NOT NULL,
  alt_names_ru text,
  country_code char(2) NOT NULL REFERENCES public.geonames_countries(iso2),
  admin1_code  text,
  admin1_name  text,
  population   integer,
  location     geography(point, 4326) NOT NULL,
  feature_code text
);

CREATE INDEX idx_geonames_cities_country ON geonames_cities(country_code);
CREATE INDEX idx_geonames_cities_name_trgm ON geonames_cities USING gin (name gin_trgm_ops);
CREATE INDEX idx_geonames_cities_ascii_trgm ON geonames_cities USING gin (ascii_name gin_trgm_ops);
CREATE INDEX idx_geonames_cities_alt_ru_trgm ON geonames_cities USING gin (alt_names_ru gin_trgm_ops);
CREATE INDEX idx_geonames_cities_location ON geonames_cities USING gist (location);
CREATE INDEX idx_geonames_cities_population ON geonames_cities(country_code, population DESC);

ALTER TABLE public.geonames_cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_cities" ON geonames_cities FOR SELECT USING (true);
