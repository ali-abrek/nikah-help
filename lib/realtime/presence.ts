import { createAdminClient } from '@/lib/supabase/admin'

const ONLINE_THRESHOLD_MS = 120_000 // 2 minutes

export async function getPresence(userId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('last_seen_at')
    .eq('id', userId)
    .single()

  if (!data?.last_seen_at) return false
  return Date.now() - new Date(data.last_seen_at).getTime() < ONLINE_THRESHOLD_MS
}
