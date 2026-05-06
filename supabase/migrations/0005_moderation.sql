-- 0005_moderation.sql
-- Moderation, blocks, pricing, and idempotency tables

-- ============================================================
-- Reports
-- ============================================================
CREATE TABLE public.reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type             report_type NOT NULL,
  entity_id        uuid NOT NULL,
  status           report_status DEFAULT 'new',
  comment          text,
  created_at       timestamptz DEFAULT now(),
  resolved_at      timestamptz,
  moderator_id     uuid REFERENCES public.profiles(id),
  resolution       text
);

CREATE INDEX idx_reports_queue ON reports(type, status, created_at DESC);
CREATE INDEX idx_reports_reported_user ON reports(reported_user_id);

-- ============================================================
-- Blocks (with peppered email hash for persistence past deletion)
-- ============================================================
CREATE TABLE public.blocks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  blocked_email_hash bytea NOT NULL,
  reason             text,
  created_at         timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_blocks_pair_active
  ON blocks(blocker_id, blocked_id) WHERE blocked_id IS NOT NULL;
CREATE UNIQUE INDEX idx_blocks_pair_hash
  ON blocks(blocker_id, blocked_email_hash);
CREATE INDEX idx_blocks_blocked ON blocks(blocked_id) WHERE blocked_id IS NOT NULL;
CREATE INDEX idx_blocks_blocked_hash ON blocks(blocked_email_hash);

ALTER TABLE blocks ADD CONSTRAINT no_self_block
  CHECK (blocker_id <> blocked_id OR blocked_id IS NULL);

-- ============================================================
-- Banned Emails
-- ============================================================
CREATE TABLE public.banned_emails (
  email       text PRIMARY KEY,
  reason_code text NOT NULL,
  notes       text,
  banned_by   uuid NOT NULL REFERENCES public.profiles(id),
  created_at  timestamptz DEFAULT now(),
  lifted_at   timestamptz,
  lifted_by   uuid REFERENCES public.profiles(id)
);

-- ============================================================
-- User Suspensions
-- ============================================================
CREATE TABLE public.user_suspensions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind        suspension_kind NOT NULL,
  reason_code text NOT NULL,
  notes       text,
  created_by  uuid NOT NULL REFERENCES public.profiles(id),
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz,
  lifted_at   timestamptz,
  lifted_by   uuid REFERENCES public.profiles(id)
);

-- Helper: IMMUTABLE now() for index predicates
CREATE OR REPLACE FUNCTION public.immutable_now()
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $$ SELECT now()::timestamptz; $$;

CREATE INDEX idx_suspensions_active ON user_suspensions(user_id)
  WHERE lifted_at IS NULL AND (expires_at IS NULL OR expires_at > immutable_now());

-- ============================================================
-- Pricing Plans
-- ============================================================
CREATE TABLE public.pricing_plans (
  code             text PRIMARY KEY,
  name_key         text NOT NULL,
  description_key  text NOT NULL,
  amount_kopecks   integer NOT NULL CHECK (amount_kopecks > 0),
  currency         text NOT NULL DEFAULT 'RUB',
  period_days      integer NOT NULL CHECK (period_days > 0),
  is_active        boolean NOT NULL DEFAULT true,
  updated_at       timestamptz DEFAULT now()
);

-- ============================================================
-- Idempotency Keys
-- ============================================================
CREATE TABLE public.idempotency_keys (
  key        text PRIMARY KEY,
  response   jsonb,
  created_at timestamptz DEFAULT now()
);
