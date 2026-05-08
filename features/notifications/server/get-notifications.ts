import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database.types'

export type NotificationWithPayload = Database['public']['Tables']['notifications']['Row']

export async function getNotifications(
  userId: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<NotificationWithPayload[]> {
  const { cursor, limit = 20 } = options
  const supabase = createAdminClient()

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data } = await query

  return data ?? []
}

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'unread')

  return count ?? 0
}
