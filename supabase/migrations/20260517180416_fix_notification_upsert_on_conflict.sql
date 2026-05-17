-- 20260517180416_fix_notification_upsert_on_conflict.sql
-- Fix: upsert on notifications fails with "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification".
--
-- Root cause: the partial unique index uniq_notifications_user_dedupe
-- WHERE dedupe_key IS NOT NULL cannot serve as an arbiter for
-- ON CONFLICT (user_id, dedupe_key) because PostgreSQL requires the
-- ON CONFLICT clause to include a matching WHERE predicate.
-- Supabase JS SDK does not support passing a WHERE clause.
--
-- Fix: replace the partial unique index with a full unique index.
-- PostgreSQL treats NULL values as distinct in unique indexes, so
-- multiple rows with dedupe_key=NULL for the same user_id do NOT
-- conflict — preserving the original intent of the partial index.

DROP INDEX IF EXISTS uniq_notifications_user_dedupe;

CREATE UNIQUE INDEX uniq_notifications_user_dedupe
  ON public.notifications (user_id, dedupe_key);
