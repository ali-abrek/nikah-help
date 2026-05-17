-- immutable_now() is marked IMMUTABLE but calls now() which is STABLE.
-- The predicate expires_at > immutable_now() is evaluated at index build time,
-- so expired rows are never pruned. Drop the function and index unconditionally.
DROP INDEX IF EXISTS idx_suspensions_active;
DROP FUNCTION IF EXISTS public.immutable_now();
CREATE INDEX idx_suspensions_user_id ON user_suspensions(user_id);
