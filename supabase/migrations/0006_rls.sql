-- 0006_rls.sql
-- Row Level Security policies and helper functions for all tables

-- ============================================================
-- Helper Functions
-- ============================================================

-- Role hierarchy check
CREATE OR REPLACE FUNCTION public.has_role(user_id uuid, required_role text)
RETURNS boolean AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = user_id;
  RETURN CASE
    WHEN required_role = 'user' THEN true
    WHEN required_role = 'moderator' AND user_role IN ('moderator', 'admin') THEN true
    WHEN required_role = 'admin' AND user_role = 'admin' THEN true
    ELSE false
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Block check: true if either user blocked the other
CREATE OR REPLACE FUNCTION public.is_blocked_pair(a uuid, b uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Suspension check: true if user has active non-warning suspension
CREATE OR REPLACE FUNCTION public.is_user_suspended(p_user uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_suspensions
    WHERE user_id = p_user
      AND lifted_at IS NULL
      AND kind <> 'warning'
      AND (expires_at IS NULL OR expires_at > now())
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Email ban check
CREATE OR REPLACE FUNCTION public.is_email_banned(p_email text) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM banned_emails
    WHERE email = lower(p_email) AND lifted_at IS NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Likes used count (for 3-lifetime-free enforcement)
CREATE OR REPLACE FUNCTION public.count_likes_used(p_user uuid) RETURNS integer AS $$
  SELECT count(*)::integer FROM likes WHERE from_user_id = p_user;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Active subscription check
CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = p_user
      AND status = 'active'
      AND current_period_end > now()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Email hash helper (pepper-based)
CREATE OR REPLACE FUNCTION public.email_hash(p_email text, p_pepper text)
RETURNS bytea AS $$
  SELECT digest(p_pepper || lower(p_email), 'sha256');
$$ LANGUAGE sql IMMUTABLE;

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_suspensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- profiles
-- ============================================================
CREATE POLICY "select_profile" ON profiles
  FOR SELECT USING (
    auth.uid() = id
    OR (
      NOT is_blocked_pair(auth.uid(), profiles.id)
      AND NOT is_user_suspended(profiles.id)
      AND (
        is_published = true
        OR EXISTS (
          SELECT 1 FROM matches
          WHERE (user_a = auth.uid() AND user_b = profiles.id)
             OR (user_b = auth.uid() AND user_a = profiles.id)
        )
      )
    )
  );

CREATE POLICY "update_own_profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "insert_own_profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "admin_manage_profiles" ON profiles
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ============================================================
-- photos
-- ============================================================
CREATE POLICY "select_photos" ON photos
  FOR SELECT USING (
    photos.profile_id = auth.uid()
    OR (
      moderation_status = 'approved'
      AND NOT is_blocked_pair(auth.uid(), photos.profile_id)
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = photos.profile_id
          AND NOT is_user_suspended(p.id)
          AND (
            p.is_published = true
            OR EXISTS (
              SELECT 1 FROM matches
              WHERE (user_a = auth.uid() AND user_b = photos.profile_id)
                 OR (user_b = auth.uid() AND user_a = photos.profile_id)
            )
          )
      )
    )
  );

CREATE POLICY "owner_manage_photos" ON photos
  FOR ALL USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- ============================================================
-- likes
-- ============================================================
CREATE POLICY "select_likes" ON likes
  FOR SELECT USING (
    from_user_id = auth.uid() OR to_user_id = auth.uid()
  );

CREATE POLICY "insert_likes" ON likes
  FOR INSERT WITH CHECK (
    from_user_id = auth.uid()
    AND NOT is_blocked_pair(from_user_id, to_user_id)
    AND NOT is_user_suspended(from_user_id)
  );

-- ============================================================
-- matches
-- ============================================================
CREATE POLICY "select_matches" ON matches
  FOR SELECT USING (
    user_a = auth.uid() OR user_b = auth.uid()
  );

-- ============================================================
-- chats
-- ============================================================
CREATE POLICY "select_chats" ON chats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = chats.match_id
        AND (matches.user_a = auth.uid() OR matches.user_b = auth.uid())
    )
  );

-- ============================================================
-- messages
-- ============================================================
CREATE POLICY "select_messages" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chats
      JOIN matches ON matches.id = chats.match_id
      WHERE chats.id = messages.chat_id
        AND (matches.user_a = auth.uid() OR matches.user_b = auth.uid())
    )
  );

CREATE POLICY "insert_messages" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chats
      JOIN matches ON matches.id = chats.match_id
      WHERE chats.id = messages.chat_id
        AND (matches.user_a = auth.uid() OR matches.user_b = auth.uid())
    )
  );

CREATE POLICY "update_own_messages" ON messages
  FOR UPDATE USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- ============================================================
-- notifications
-- ============================================================
CREATE POLICY "select_own_notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "update_own_notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- notification_preferences
-- ============================================================
CREATE POLICY "manage_own_notif_prefs" ON notification_preferences
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- subscriptions
-- ============================================================
CREATE POLICY "select_own_subscription" ON subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- push_subscriptions
-- ============================================================
CREATE POLICY "manage_own_push_subs" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- reports
-- ============================================================
CREATE POLICY "select_reports" ON reports
  FOR SELECT USING (
    reporter_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('moderator', 'admin')
    )
  );

CREATE POLICY "insert_reports" ON reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "update_reports_moderator" ON reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('moderator', 'admin')
    )
  );

-- ============================================================
-- blocks
-- ============================================================
CREATE POLICY "manage_own_blocks" ON blocks
  FOR ALL USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());

-- ============================================================
-- banned_emails
-- ============================================================
CREATE POLICY "moderator_read_banned" ON banned_emails
  FOR SELECT USING (has_role(auth.uid(), 'moderator'));

CREATE POLICY "admin_manage_banned" ON banned_emails
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ============================================================
-- user_suspensions
-- ============================================================
CREATE POLICY "select_own_suspensions" ON user_suspensions
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'moderator'));

CREATE POLICY "moderator_manage_suspensions" ON user_suspensions
  FOR ALL USING (has_role(auth.uid(), 'moderator'))
  WITH CHECK (has_role(auth.uid(), 'moderator'));

-- ============================================================
-- pricing_plans
-- ============================================================
CREATE POLICY "select_active_plans" ON pricing_plans
  FOR SELECT USING (is_active = true);

CREATE POLICY "admin_manage_plans" ON pricing_plans
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ============================================================
-- idempotency_keys
-- ============================================================
CREATE POLICY "select_idempotency" ON idempotency_keys
  FOR SELECT USING (true);

CREATE POLICY "insert_idempotency" ON idempotency_keys
  FOR INSERT WITH CHECK (true);
