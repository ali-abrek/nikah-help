-- 0016_likes_delete_rls.sql
-- Add DELETE policy for likes and INSERT policy for notifications

-- Allow users to delete their own likes
CREATE POLICY "delete_own_likes" ON likes
  FOR DELETE USING (from_user_id = auth.uid());

-- Allow system (admin) to insert notifications
CREATE POLICY "admin_insert_notifications" ON notifications
  FOR INSERT WITH CHECK (true);
