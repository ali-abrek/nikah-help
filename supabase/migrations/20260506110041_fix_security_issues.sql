-- Fix security issues from Supabase advisors

-- 1. spatial_ref_sys is a PostGIS system table owned by postgres; cannot ALTER.
--    It contains only public EPSG reference data — risk is minimal.

-- 2. Fix mutable search_path for SECURITY DEFINER functions (lint 0011)
ALTER FUNCTION public.has_role(uuid, text) SET search_path = 'public, extensions';
ALTER FUNCTION public.is_blocked_pair(uuid, uuid) SET search_path = 'public, extensions';
ALTER FUNCTION public.is_user_suspended(uuid) SET search_path = 'public, extensions';
ALTER FUNCTION public.is_email_banned(text) SET search_path = 'public, extensions';
ALTER FUNCTION public.count_likes_used(uuid) SET search_path = 'public, extensions';
ALTER FUNCTION public.has_active_subscription(uuid) SET search_path = 'public, extensions';
ALTER FUNCTION public.handle_match() SET search_path = 'public, extensions';
ALTER FUNCTION public.handle_new_user() SET search_path = 'public, extensions';
ALTER FUNCTION public.get_nearby_profile_ids(float8, float8, int4, int4) SET search_path = 'public, extensions';
ALTER FUNCTION public.get_photo_stream_context(uuid, uuid) SET search_path = 'public, extensions';

-- 3. Fix search_path for non-SECURITY DEFINER functions flagged by linter
ALTER FUNCTION public.email_hash(text, text) SET search_path = 'public, extensions';
ALTER FUNCTION public.immutable_now() SET search_path = 'public, extensions';
ALTER FUNCTION public.reorder_profile_photos(uuid, uuid[]) SET search_path = 'public, extensions';
ALTER FUNCTION public.enforce_max_photos() SET search_path = 'public, extensions';

-- 4. Tighten admin_insert_notifications to actually require moderator/admin role
DROP POLICY IF EXISTS "admin_insert_notifications" ON notifications;
CREATE POLICY "admin_insert_notifications" ON notifications
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'moderator'));

-- 5. Revoke direct anon RPC access to trigger-only functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_match() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_max_photos() FROM anon, authenticated;
