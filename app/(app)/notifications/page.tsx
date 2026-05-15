import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getNotifications } from '@/features/notifications/server/get-notifications'
import { NotificationList } from '@/features/notifications/components/NotificationList'
import { getUserId } from '@/lib/auth/claims'

export const metadata = { title: 'Уведомления — Nikah Help' }

export default async function NotificationsPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const userId = getUserId((data?.claims ?? {}) as Record<string, unknown>)
  if (!userId) redirect('/auth')

  const notifications = await getNotifications(userId)
  return <NotificationList initialNotifications={notifications} userId={userId} />
}
