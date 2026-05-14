-- Restore Supabase default schema/table privileges that were never applied
-- to this project. Without them, RLS policies are unreachable: PostgREST
-- queries fail at the table-privilege layer (SQLSTATE 42501) before RLS
-- even runs. Symptom: "permission denied for table matches" during profile
-- UPDATE, surfaced to users as "Please log in".

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS
  TO anon, authenticated, service_role;

-- Re-apply intentional lockdown from 20260509093515_hardening.sql.
-- The broad GRANT above un-did it.
REVOKE ALL ON TABLE public.idempotency_keys FROM authenticated, anon;

-- Re-apply intentional function REVOKEs (trigger-only or service-role-only).
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_match()                       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_max_photos()                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_like(uuid, uuid)                FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_user_online(uuid)                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_photo_stream_context(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reorder_profile_photos(uuid, uuid[], text) FROM anon;
