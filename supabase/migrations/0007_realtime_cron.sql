-- 0007_realtime_cron.sql
-- Supabase Realtime publication and pg_cron maintenance jobs

-- ============================================================
-- Realtime Publication
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.messages,
  public.notifications,
  public.profiles,
  public.matches;

-- ============================================================
-- pg_cron Jobs
-- ============================================================
SELECT cron.schedule('cleanup_idempotency_keys', '0 * * * *',
  $$DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'$$
);

SELECT cron.schedule('purge_deleted_profiles', '0 2 * * *',
  $$DELETE FROM profiles WHERE deletion_status = 'deleted' AND updated_at < now() - interval '30 days'$$
);
