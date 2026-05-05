-- 0003_social.sql
-- Social interaction tables: likes, matches, chats, messages

-- ============================================================
-- Likes
-- ============================================================
CREATE TABLE public.likes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_likes_pair ON likes(from_user_id, to_user_id);
CREATE INDEX idx_likes_to ON likes(to_user_id);

-- ============================================================
-- Matches
-- ============================================================
CREATE TABLE public.matches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_matches_pair ON matches(
  LEAST(user_a, user_b), GREATEST(user_a, user_b)
);

-- ============================================================
-- Chats
-- ============================================================
CREATE TABLE public.chats (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- Messages
-- ============================================================
CREATE TABLE public.messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id          uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type             message_type NOT NULL,
  content          text NOT NULL,
  parent_id        uuid REFERENCES public.messages(id),
  status           message_status DEFAULT 'sent',
  created_at       timestamptz DEFAULT now(),
  read_at          timestamptz,
  edited_at        timestamptz,
  original_content text,
  deleted_at       timestamptz
);

CREATE INDEX idx_messages_chat ON messages(chat_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- ============================================================
-- Match trigger: mutual like creates match + chat atomically
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_match()
RETURNS trigger AS $$
DECLARE
  v_match_id uuid;
  v_chat_id  uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM likes
    WHERE from_user_id = NEW.to_user_id AND to_user_id = NEW.from_user_id
  ) THEN
    INSERT INTO matches (user_a, user_b)
    VALUES (LEAST(NEW.from_user_id, NEW.to_user_id), GREATEST(NEW.from_user_id, NEW.to_user_id))
    RETURNING id INTO v_match_id;

    INSERT INTO chats (match_id) VALUES (v_match_id) RETURNING id INTO v_chat_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_like_created
  AFTER INSERT ON likes
  FOR EACH ROW EXECUTE FUNCTION public.handle_match();
