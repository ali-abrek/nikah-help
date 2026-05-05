-- 0002_profiles_photos.sql
-- Core user-facing tables: profiles and photos

-- ============================================================
-- Profiles
-- ============================================================
CREATE TABLE public.profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               text NOT NULL UNIQUE,
  role                user_role NOT NULL DEFAULT 'user',
  name                text,
  gender              gender_type,
  birth_date          date CHECK (birth_date <= current_date - interval '18 years'),
  country             text,
  city                text,
  nationality         text,
  height              integer,
  weight              integer,
  location            geography(point, 4326),
  marital_status      text,
  children_count      integer DEFAULT 0,
  education           text,
  income_level        text,
  housing             text,
  willing_to_relocate boolean,
  polygyny_attitude   text,
  hijab_attitude      text,
  about_self          text,
  ai_bio              text,
  ai_bio_status       ai_bio_status DEFAULT 'ready',
  is_published        boolean DEFAULT true,
  private_mode        boolean DEFAULT false,
  onboarding_completed boolean DEFAULT false,
  locale              text DEFAULT 'ru',
  theme_preference    text DEFAULT 'system',
  last_seen_at        timestamptz,
  deletion_status     text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_profiles_gender ON profiles(gender) WHERE is_published = true;
CREATE INDEX idx_profiles_location ON profiles USING GIST (location);
CREATE INDEX idx_profiles_role ON profiles(role);

-- ============================================================
-- Photos
-- ============================================================
CREATE TABLE public.photos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path      text,
  position          smallint NOT NULL CHECK (position BETWEEN 1 AND 6),
  status            photo_status DEFAULT 'pending',
  moderation_status moderation_status DEFAULT 'queued',
  moderation_result jsonb,
  moderation_reason text,
  variants          jsonb DEFAULT '{}',
  phash             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_photos_profile_position ON photos(profile_id, position);
CREATE INDEX idx_photos_profile_visible
  ON photos(profile_id, position)
  WHERE moderation_status = 'approved';
CREATE INDEX idx_photos_moderation_queue
  ON photos(moderation_status, created_at)
  WHERE moderation_status IN ('queued', 'manual_review');

-- Enforce max 6 photos per profile
CREATE OR REPLACE FUNCTION public.enforce_max_photos() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM photos WHERE profile_id = NEW.profile_id) > 6 THEN
    RAISE EXCEPTION 'Profile cannot have more than 6 photos';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_max_photos AFTER INSERT ON photos
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_max_photos();
