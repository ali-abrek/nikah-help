-- Fix: reorder_profile_photos fails with "violates check constraint photos_position_check".
--
-- Root cause: the previous fix moved positions to negative values (-1001, -1002)
-- to avoid mid-statement unique-index conflicts, but photos.position has a
-- CHECK (position >= 1 AND position <= 6) that rejects any negative value.
--
-- Fix: replace the non-deferrable unique INDEX with a DEFERRABLE INITIALLY
-- DEFERRED unique CONSTRAINT. Uniqueness is then checked at end of statement,
-- so a single UPDATE that swaps positions does not conflict. The function
-- reduces to one UPDATE pass and positions stay within the 1..6 range.

DROP INDEX IF EXISTS public.idx_photos_profile_position;

ALTER TABLE public.photos
  ADD CONSTRAINT photos_profile_position_key
  UNIQUE (profile_id, "position")
  DEFERRABLE INITIALLY DEFERRED;

-- Drop the leftover 2-arg overload from 0014_reorder_photos.sql; PostgREST
-- would otherwise see both signatures and could pick the older non-secure one.
DROP FUNCTION IF EXISTS public.reorder_profile_photos(uuid, uuid[]);

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

  -- Single-pass reorder. The unique constraint on (profile_id, position) is
  -- DEFERRED, so transient duplicate positions mid-statement are tolerated.
  -- WITH ORDINALITY guarantees the row number matches the array index.
  UPDATE photos
     SET position = v.new_pos::smallint,
         updated_at = now()
    FROM (
      SELECT id, ord AS new_pos
      FROM unnest(p_photo_ids) WITH ORDINALITY AS u(id, ord)
    ) AS v
   WHERE photos.id = v.id AND photos.profile_id = p_profile_id;
END $$;

REVOKE ALL ON FUNCTION public.reorder_profile_photos(uuid, uuid[], text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reorder_profile_photos(uuid, uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reorder_profile_photos(uuid, uuid[], text)
  TO authenticated, service_role;
