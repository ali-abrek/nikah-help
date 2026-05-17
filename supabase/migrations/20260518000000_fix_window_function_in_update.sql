-- Fix: "window functions are not allowed in UPDATE"
-- Root cause: row_number() OVER (...) used directly in SET clause of UPDATE.
-- PostgreSQL does not allow window functions in UPDATE SET.
-- Fix: move the window function into a subquery in the FROM clause.

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
     SET position = v.neg_pos,
         updated_at = now()
    FROM (
      SELECT id, -(row_number() OVER (ORDER BY position) + 1000) AS neg_pos
      FROM photos
      WHERE profile_id = p_profile_id
    ) AS v
   WHERE photos.id = v.id AND photos.profile_id = p_profile_id;

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
