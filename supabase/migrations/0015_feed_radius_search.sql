-- 0015_feed_radius_search.sql
-- Postgres function for radius-based profile search using PostGIS

CREATE OR REPLACE FUNCTION public.get_nearby_profile_ids(
  p_longitude double precision,
  p_latitude double precision,
  p_radius_meters integer,
  p_limit integer DEFAULT 500
) RETURNS TABLE(profile_id uuid, distance_meters double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    ST_Distance(
      p.location::geography,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
    ) AS distance_meters
  FROM profiles p
  WHERE p.location IS NOT NULL
    AND p.is_published = true
    AND ST_DWithin(
      p.location::geography,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
      p_radius_meters
    )
  ORDER BY distance_meters ASC
  LIMIT p_limit;
END $$;
