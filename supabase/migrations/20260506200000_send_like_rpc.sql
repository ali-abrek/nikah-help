-- send_like(p_from, p_to) — atomic like + match detection.
--
-- Replaces a 5-roundtrip TS sequence (target → sender → blocked-pair → existing
-- like → INSERT → match check) with a single SECURITY DEFINER call. All
-- preconditions are evaluated against committed state and the like INSERT
-- fires the existing handle_match() trigger; we then read whichever match row
-- the trigger may have just produced.
--
-- The function returns one row { matched, match_id, error_code } so the
-- caller can short-circuit without re-querying. Errors are surfaced via
-- error_code (text matching the AppError registry) instead of RAISE so the
-- transaction is not aborted on validation failures and the caller can map
-- them to user-friendly messages.

CREATE OR REPLACE FUNCTION public.send_like(
  p_from uuid,
  p_to   uuid
)
RETURNS TABLE (
  matched    boolean,
  match_id   uuid,
  error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_gender       text;
  v_target_published    boolean;
  v_sender_gender       text;
  v_match_id            uuid;
  v_blocked             boolean;
BEGIN
  IF p_from = p_to THEN
    RETURN QUERY SELECT false, NULL::uuid, 'LIKE_OWN_PROFILE'::text;
    RETURN;
  END IF;

  SELECT gender::text, is_published
    INTO v_target_gender, v_target_published
    FROM profiles WHERE id = p_to;

  IF v_target_gender IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'NOT_FOUND'::text;
    RETURN;
  END IF;

  IF NOT v_target_published THEN
    RETURN QUERY SELECT false, NULL::uuid, 'LIKE_TARGET_UNPUBLISHED'::text;
    RETURN;
  END IF;

  SELECT gender::text INTO v_sender_gender FROM profiles WHERE id = p_from;
  IF v_sender_gender IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'AUTH_UNAUTHORIZED'::text;
    RETURN;
  END IF;

  IF v_sender_gender = v_target_gender THEN
    RETURN QUERY SELECT false, NULL::uuid, 'LIKE_GENDER_MISMATCH'::text;
    RETURN;
  END IF;

  v_blocked := public.is_blocked_pair(p_from, p_to);
  IF v_blocked THEN
    RETURN QUERY SELECT false, NULL::uuid, 'LIKE_BLOCKED'::text;
    RETURN;
  END IF;

  -- INSERT … ON CONFLICT keeps the call idempotent. Pre-existing rows yield
  -- LIKE_ALREADY_SENT so the client UI doesn't re-fire match-celebration.
  INSERT INTO likes (from_user_id, to_user_id)
  VALUES (p_from, p_to)
  ON CONFLICT (from_user_id, to_user_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'LIKE_ALREADY_SENT'::text;
    RETURN;
  END IF;

  -- handle_match() trigger may have inserted a match row in this transaction.
  SELECT id INTO v_match_id
    FROM matches
   WHERE (user_a = p_from AND user_b = p_to)
      OR (user_a = p_to   AND user_b = p_from)
   LIMIT 1;

  RETURN QUERY SELECT (v_match_id IS NOT NULL), v_match_id, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.send_like(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_like(uuid, uuid) TO authenticated, service_role;
