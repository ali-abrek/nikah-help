import { createServerSupabase } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth/claims'
import { SettingsScreen } from '@/features/settings/components/SettingsScreen'
import { ScreenBody } from '@/components/layout/AppShell'

export const metadata = { title: 'Настройки — Nikah Help' }

export default async function SettingsPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims ? getUserId(data.claims as Record<string, unknown>) : null

  let isPublished = false
  let role: 'user' | 'admin' | 'moderator' | null = null
  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_published, role')
      .eq('id', userId)
      .single()
    isPublished = !!profile?.is_published
    role = (profile?.role as 'user' | 'admin' | 'moderator' | null) ?? null
  }

  return (
    <ScreenBody>
      <SettingsScreen isAuthed={!!userId} isPublished={isPublished} role={role} />
    </ScreenBody>
  )
}
