-- 0013_get_photo_stream_context.sql
-- Postgres function for photo stream authorisation and blur decision.
-- Runs under service role (bypasses RLS); authz is explicit.

CREATE OR REPLACE FUNCTION public.get_photo_stream_context(
  p_photo_id uuid,
  p_viewer_id uuid
) RETURNS TABLE(
  id uuid,
  profile_id uuid,
  moderation_status text,
  variants jsonb,
  is_published boolean,
  private_mode boolean,
  show_full boolean,
  can_view boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    ph.id,
    ph.profile_id,
    ph.moderation_status::text,
    ph.variants,
    p.is_published,
    p.private_mode,
    (
      ph.profile_id = p_viewer_id
      OR p.private_mode = false
      OR EXISTS (
          SELECT 1 FROM matches
          WHERE (user_a = p_viewer_id AND user_b = ph.profile_id)
             OR (user_b = p_viewer_id AND user_a = ph.profile_id)
      )
      OR EXISTS (
          SELECT 1 FROM likes
          WHERE from_user_id = ph.profile_id AND to_user_id = p_viewer_id
      )
    ) AS show_full,
    (
      ph.profile_id = p_viewer_id
      OR (
        ph.moderation_status = 'approved'
        AND NOT is_blocked_pair(p_viewer_id, ph.profile_id)
        AND NOT is_user_suspended(ph.profile_id)
        AND (
          p.is_published = true
          OR EXISTS (
            SELECT 1 FROM matches
            WHERE (user_a = p_viewer_id AND user_b = ph.profile_id)
               OR (user_b = p_viewer_id AND user_a = ph.profile_id)
          )
        )
      )
    ) AS can_view
  FROM photos ph
  JOIN profiles p ON p.id = ph.profile_id
  WHERE ph.id = p_photo_id;
END $$;
