-- 0004_notifications_subscriptions.sql
-- Notifications, subscriptions, and push delivery tables

-- ============================================================
-- Notifications
-- ============================================================
CREATE TABLE public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       text NOT NULL,
  status     notification_status DEFAULT 'unread',
  title_key  text NOT NULL,
  body_key   text NOT NULL,
  payload    jsonb DEFAULT '{}',
  entity_id  uuid,
  created_at timestamptz DEFAULT now(),
  read_at    timestamptz
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, status) WHERE status = 'unread';

-- ============================================================
-- Notification Preferences
-- ============================================================
CREATE TABLE public.notification_preferences (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type    text NOT NULL,
  enabled boolean DEFAULT true
);

CREATE UNIQUE INDEX idx_notif_prefs_user_type ON notification_preferences(user_id, type);

-- ============================================================
-- Subscriptions (T-Bank payments)
-- ============================================================
CREATE TABLE public.subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  tbank_payment_id      text,
  tbank_customer_key    text,
  status                subscription_status DEFAULT 'inactive',
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ============================================================
-- Push Subscriptions (web, APNs, FCM)
-- ============================================================
CREATE TABLE public.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind         push_kind NOT NULL DEFAULT 'web',
  endpoint     text,
  auth         text,
  p256dh       text,
  device_token text,
  device_id    text,
  locale       text,
  last_seen_at timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_push_web_endpoint
  ON push_subscriptions(endpoint)
  WHERE kind = 'web' AND endpoint IS NOT NULL;

CREATE UNIQUE INDEX idx_push_native_token
  ON push_subscriptions(user_id, device_token)
  WHERE kind IN ('apns', 'fcm') AND device_token IS NOT NULL;

CREATE INDEX idx_push_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ADD CONSTRAINT push_kind_fields_check CHECK (
  (kind = 'web'  AND endpoint IS NOT NULL AND auth IS NOT NULL AND p256dh IS NOT NULL AND device_token IS NULL)
  OR
  (kind IN ('apns', 'fcm') AND device_token IS NOT NULL AND endpoint IS NULL AND auth IS NULL AND p256dh IS NULL)
);
