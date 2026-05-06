-- Phase 2: Revoke PUBLIC EXECUTE from trigger-only and internal functions
-- Phase 1 REVOKE didn't work because PUBLIC still had the grant.

-- Trigger functions: only called by triggers, not meant for RPC
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_match() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_max_photos() FROM PUBLIC;

-- PostGIS internal functions: not meant for RPC
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text, boolean) FROM PUBLIC;
