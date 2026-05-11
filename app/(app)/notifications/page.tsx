import { createServerSupabase } from '@/lib/supabase/server'
import { getNotifications } from '@/features/notifications/server/get-notifications'
import { NotificationList } from '@/features/notifications/components/NotificationList'
import { getUserId } from '@/lib/auth/claims'

export default async function NotificationsPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-500">Требуется авторизация</p>
      </div>
    )
  }

  const userId = getUserId(data.claims as Record<string, unknown>)
  if (!userId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-500">Требуется авторизация</p>
      </div>
    )
  }
  const notifications = await getNotifications(userId)

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="px-4 py-4 text-xl font-bold text-foreground">Уведомления</h1>
      <NotificationList initialNotifications={notifications} userId={userId} />
    </div>
  )
}
