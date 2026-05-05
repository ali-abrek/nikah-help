-- 0008_storage.sql
-- Storage buckets and RLS policies for private file storage

-- ============================================================
-- Buckets
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('profile-photos', 'profile-photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif']),
  ('chat-media', 'chat-media', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'audio/webm', 'audio/mp4', 'audio/mpeg'])
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- profile-photos: owner-only access
-- ============================================================
CREATE POLICY "owner_select_photos_storage" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'profile-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "owner_insert_photos_storage" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "owner_delete_photos_storage" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- chat-media: participant-only access
-- ============================================================
CREATE POLICY "participant_select_chat_media" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM chats
      JOIN matches ON matches.id = chats.match_id
      WHERE chats.id::text = (storage.foldername(name))[1]
        AND (matches.user_a = auth.uid() OR matches.user_b = auth.uid())
    )
  );

CREATE POLICY "participant_insert_chat_media" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM chats
      JOIN matches ON matches.id = chats.match_id
      WHERE chats.id::text = (storage.foldername(name))[1]
        AND (matches.user_a = auth.uid() OR matches.user_b = auth.uid())
    )
  );
