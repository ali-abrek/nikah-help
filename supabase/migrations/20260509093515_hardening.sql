-- 20260509093515_hardening.sql
-- Bundled hardening pass off the back of the codebase review:
--   H2  — restrict idempotency_keys (app uses Redis; deny non-admin access).
--   M1  — set search_path on get_photo_stream_context (definer hardening
--         consistent with 20260506110041_fix_security_issues).
--   M2  — add 'pending' to ai_bio_status enum used by application code.
--   H8  — eliminate concurrent mutual-like race in send_like with a pair
--         advisory lock and explicit reciprocal handling.

-- ============================================================
-- H2 — idempotency_keys lockdown
-- ============================================================
-- The app stores idempotency state in Upstash Redis (lib/idempotency/*),
-- not in this table. Lock it down so a future regression that does write
-- here cannot leak across users while the schema lacks a user scope.
DROP POLICY IF EXISTS "select_idempotency" ON public.idempotency_keys;
DROP POLICY IF EXISTS "insert_idempotency" ON public.idempotency_keys;

CREATE POLICY "deny_all_idempotency" ON public.idempotency_keys
  FOR ALL USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.idempotency_keys FROM authenticated, anon;

-- ============================================================
-- M1 — get_photo_stream_context: pin search_path
-- ============================================================
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
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
        AND NOT public.is_blocked_pair(p_viewer_id, ph.profile_id)
        AND NOT public.is_user_suspended(ph.profile_id)
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

REVOKE ALL ON FUNCTION public.get_photo_stream_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_photo_stream_context(uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- M2 — ai_bio_status: add 'pending'
-- ============================================================
ALTER TYPE public.ai_bio_status ADD VALUE IF NOT EXISTS 'pending';

-- ============================================================
-- H8 — send_like: eliminate mutual-like race
-- ============================================================
-- We take a transaction-scoped advisory lock keyed on the unordered pair
-- (least(a,b), greatest(a,b)). Both A→B and B→A then serialise on the same
-- key, so by the time the second transaction inserts, the first has already
-- committed and its row is visible. handle_match() then sees the reciprocal
-- like during its own statement and creates the match deterministically.
--
-- The lock is released automatically at COMMIT/ROLLBACK.

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
  v_pair_low            uuid;
  v_pair_high           uuid;
BEGIN
  IF p_from = p_to THEN
    RETURN QUERY SELECT false, NULL::uuid, 'LIKE_OWN_PROFILE'::text;
    RETURN;
  END IF;

  -- Deterministic ordering so A→B and B→A hash to the same advisory lock.
  IF p_from < p_to THEN
    v_pair_low  := p_from;
    v_pair_high := p_to;
  ELSE
    v_pair_low  := p_to;
    v_pair_high := p_from;
  END IF;

  -- Two int8 keys derived from the UUID pair. hashtextextended is stable
  -- and produces well-distributed bigints suitable for advisory locks.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_pair_low::text,  0),
    hashtextextended(v_pair_high::text, 0)
  );

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

  INSERT INTO likes (from_user_id, to_user_id)
  VALUES (p_from, p_to)
  ON CONFLICT (from_user_id, to_user_id) DO NOTHING;

  IF NOT FOUND THEN
    -- Like already existed. Still report the match if one exists so a
    -- client retry after a network blip surfaces consistent state.
    SELECT id INTO v_match_id
      FROM matches
     WHERE (user_a = p_from AND user_b = p_to)
        OR (user_a = p_to   AND user_b = p_from)
     LIMIT 1;
    IF v_match_id IS NOT NULL THEN
      RETURN QUERY SELECT true, v_match_id, NULL::text;
    ELSE
      RETURN QUERY SELECT false, NULL::uuid, 'LIKE_ALREADY_SENT'::text;
    END IF;
    RETURN;
  END IF;

  -- handle_match() trigger may have inserted a match row already, OR the
  -- reciprocal like is now waiting on us behind the advisory lock; cover
  -- both cases by checking explicitly for the reciprocal direction.
  SELECT id INTO v_match_id
    FROM matches
   WHERE (user_a = p_from AND user_b = p_to)
      OR (user_a = p_to   AND user_b = p_from)
   LIMIT 1;

  IF v_match_id IS NULL THEN
    -- No match yet, but if the reciprocal like exists we create the match
    -- ourselves so neither caller misses it under serialisation pressure.
    IF EXISTS (
      SELECT 1 FROM likes
       WHERE from_user_id = p_to AND to_user_id = p_from
    ) THEN
      INSERT INTO matches (user_a, user_b)
      VALUES (LEAST(p_from, p_to), GREATEST(p_from, p_to))
      ON CONFLICT (user_a, user_b) DO NOTHING
      RETURNING id INTO v_match_id;

      IF v_match_id IS NULL THEN
        SELECT id INTO v_match_id
          FROM matches
         WHERE user_a = LEAST(p_from, p_to)
           AND user_b = GREATEST(p_from, p_to)
         LIMIT 1;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT (v_match_id IS NOT NULL), v_match_id, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.send_like(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_like(uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- M4 — reorder_profile_photos: optimistic lock
-- ============================================================
-- Replace the existing function with a version that takes a snapshot of
-- the client's view of the current ordering (id:position pairs hashed).
-- If two reorders race, the second one's snapshot won't match committed
-- state and we surface a clean PHOTO_REORDER_STALE error instead of a
-- count-mismatch crash.
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

  -- Stable signature of the canonical (position, id) ordering. The client
  -- computes the same string against the rows it last loaded; a difference
  -- means another writer reordered first and the client must refetch.
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

-- ============================================================
-- Inactivity warning bookkeeping (cron: inactive-account-warn)
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inactivity_warned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_inactivity_warn
  ON public.profiles (last_seen_at, inactivity_warned_at)
  WHERE is_published = true;

-- ============================================================
-- M12 — notification deduplication
-- ============================================================
-- Optional caller-supplied uniqueness key so a duplicate `notification/send`
-- event (e.g. transient transport double-fire) doesn't insert twice. We
-- index it as a partial unique constraint so legacy rows without a key
-- still coexist.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_user_dedupe
  ON public.notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ============================================================
-- M6 — server-side presence (no client-clock comparison)
-- ============================================================
-- Returning the boolean from Postgres avoids the wall-clock comparison
-- between the app server and `last_seen_at` written by another instance.
CREATE OR REPLACE FUNCTION public.is_user_online(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    last_seen_at IS NOT NULL
      AND last_seen_at > now() - interval '120 seconds',
    false
  )
  FROM profiles
  WHERE id = p_user
$$;

REVOKE ALL ON FUNCTION public.is_user_online(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_user_online(uuid) TO authenticated, service_role;
