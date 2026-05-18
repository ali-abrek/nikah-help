-- Allow owners to overwrite their own files in profile-photos.
-- Needed so signed upload URLs generated with { upsert: true } can replace
-- an existing original when the user re-uploads to the same path.
CREATE POLICY "owner_update_photos_storage" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
