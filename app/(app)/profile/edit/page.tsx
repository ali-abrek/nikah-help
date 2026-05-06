import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { ProfileEditForm } from '@/features/profile/components/ProfileEditForm'

export const metadata = {
  title: 'Редактирование профиля — Nikah Help',
}

export default async function ProfileEditPage() {
  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims ? ((claims as Record<string, unknown>).sub as string) : null

  if (!userId) {
    redirect('/auth')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (!profile) {
    redirect('/onboarding')
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-8 text-2xl font-bold text-foreground">
        Редактирование профиля
      </h1>

      <ProfileEditForm profile={profile as Record<string, unknown>} />
    </div>
  )
}
