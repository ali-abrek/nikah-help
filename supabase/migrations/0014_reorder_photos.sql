-- 0014_reorder_photos.sql
-- Single-statement photo reorder function to avoid UNIQUE constraint collisions

CREATE OR REPLACE FUNCTION public.reorder_profile_photos(
  p_profile_id uuid,
  p_photo_ids uuid[]
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Verify all photos belong to the profile
  IF EXISTS (
    SELECT 1 FROM photos
    WHERE id = ANY(p_photo_ids) AND profile_id != p_profile_id
  ) THEN
    RAISE EXCEPTION 'Photo does not belong to this profile';
  END IF;

  -- Verify count matches
  IF array_length(p_photo_ids, 1) != (
    SELECT count(*) FROM photos WHERE profile_id = p_profile_id
  ) THEN
    RAISE EXCEPTION 'Photo count mismatch';
  END IF;

  -- Single-statement reorder: VALUES clause with deferred unique check
  UPDATE photos SET position = v.new_pos, updated_at = now()
  FROM (
    SELECT row_number() OVER () AS new_pos, id
    FROM unnest(p_photo_ids) AS id
  ) AS v
  WHERE photos.id = v.id AND photos.profile_id = p_profile_id;
END $$;
