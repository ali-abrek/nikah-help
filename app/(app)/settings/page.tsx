import { createServerSupabase } from '@/lib/supabase/server'
import { NotificationPreferences } from '@/features/notifications/components/NotificationPreferences'
import { PushToggle } from '@/features/notifications/components/PushToggle'
import { getPreferences } from '@/features/notifications/server/get-preferences'

export default async function SettingsPage() {
  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()

  if (!claims) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-500">Требуется авторизация</p>
      </div>
    )
  }

  const userId = (claims as Record<string, unknown>).sub as string
  const preferences = await getPreferences(userId)

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="px-4 py-4 text-xl font-bold text-foreground">Настройки</h1>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        <section className="px-4 py-4">
          <h2 className="mb-3 text-base font-semibold">Уведомления</h2>
          <NotificationPreferences userId={userId} initialPreferences={preferences} />
        </section>

        <section className="px-4 py-6">
          <h2 className="mb-3 text-base font-semibold">Push-уведомления</h2>
          <PushToggle userId={userId} />
        </section>
      </div>
    </div>
  )
}