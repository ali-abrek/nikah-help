-- 20260517152107_fix_photo_reorder_duplicate_key.sql
-- Fix: reorder_profile_photos fails with "duplicate key value violates
-- unique constraint idx_photos_profile_position" when PostgreSQL checks
-- uniqueness mid-statement during position swaps.
--
-- Root cause: idx_photos_profile_position is a non-deferrable unique INDEX.
-- PostgreSQL checks uniqueness per-row during the UPDATE, not at statement
-- end, so swapping two photos' positions creates a transient conflict.
--
-- Fix: move all positions to negative values first, then assign final
-- positions. This guarantees no two rows ever share the same positive
-- position at any point during the UPDATE.

CREATE OR REPLACE FUNCTION public.reorder_profile_photos(
  p_profile_id uuid,
  p_photo_ids uuid[],
  p_expected_signature text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_signature text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM photos
    WHERE id = ANY(p_photo_ids) AND profile_id <> p_profile_id
  ) THEN
    RAISE EXCEPTION 'Photo does not belong to this profile';
  END IF;

  IF array_length(p_photo_ids, 1) <> (
    SELECT count(*) FROM photos WHERE profile_id = p_profile_id
  ) THEN
    RAISE EXCEPTION 'Photo count mismatch';
  END IF;

  -- Stable signature of the canonical (position, id) ordering.
  IF p_expected_signature IS NOT NULL THEN
    SELECT string_agg(position::text || ':' || id::text, '|' ORDER BY position)
      INTO v_current_signature
      FROM photos
     WHERE profile_id = p_profile_id;

    IF v_current_signature IS DISTINCT FROM p_expected_signature THEN
      RAISE EXCEPTION 'PHOTO_REORDER_STALE'
        USING DETAIL = 'reorder_signature_mismatch';
    END IF;
  END IF;

  -- Step 1: move all positions to negative values to avoid mid-statement conflicts.
  UPDATE photos
     SET position = -(row_number() OVER (ORDER BY position) + 1000),
         updated_at = now()
   WHERE profile_id = p_profile_id;

  -- Step 2: assign the final positions from the input array order.
  UPDATE photos SET position = v.new_pos, updated_at = now()
  FROM (
    SELECT row_number() OVER () AS new_pos, id
    FROM unnest(p_photo_ids) AS id
  ) AS v
  WHERE photos.id = v.id AND photos.profile_id = p_profile_id;
END $$;

REVOKE ALL ON FUNCTION public.reorder_profile_photos(uuid, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_profile_photos(uuid, uuid[], text)
  TO authenticated, service_role;
