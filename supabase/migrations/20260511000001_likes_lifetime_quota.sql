-- Fixes free-tier like quota bypass.
--
-- Previously, revoking a like hard-deleted the row, which allowed a free-tier
-- user to send 3 likes, revoke them, and send 3 more indefinitely.
--
-- Solution: soft-delete by adding revoked_at. The count_likes_used function is
-- updated to count ALL rows (including revoked ones) so the lifetime cap is
-- enforced correctly.

ALTER TABLE likes ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Update count_likes_used to count lifetime (including revoked) likes.
CREATE OR REPLACE FUNCTION count_likes_used(p_user UUID)
RETURNS BIGINT
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT FROM likes WHERE from_user_id = p_user;
$$;
