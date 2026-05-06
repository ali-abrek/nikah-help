-- 0011_handle_new_user.sql
-- Auto-create profile on first login via Magic Link

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Reject registration if email is on the moderator banlist.
  -- Uses SQLSTATE 'BAN01' (custom, user-defined range) so the application
  -- can detect it and return AUTH_EMAIL_BANNED to the client.
  IF public.is_email_banned(NEW.email) THEN
    RAISE EXCEPTION 'This email is banned by moderators' USING ERRCODE = 'BAN01';
  END IF;

  INSERT INTO public.profiles (id, email, onboarding_completed, role)
  VALUES (NEW.id, NEW.email, false, 'user')
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if rerunning
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
