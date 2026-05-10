import { createAdminClient } from '@/lib/supabase/admin'

// Server-side presence: defer the now() comparison to Postgres so we never
// rely on app-server vs DB-server clock agreement.
export async function getPresence(userId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase.rpc('is_user_online', { p_user: userId })
  return Boolean(data)
}
