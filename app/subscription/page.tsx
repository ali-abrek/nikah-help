import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth/claims'
import { SubscriptionScreen } from '@/features/subscription/components/SubscriptionScreen'
import { ScreenBody } from '@/components/layout/AppShell'

export const metadata = { title: 'Подписка — Nikah Help' }

export default async function SubscriptionPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims ? getUserId(data.claims as Record<string, unknown>) : null
  if (!userId) redirect('/auth')

  const { data: profile } = await supabase
    .from('profiles')
    .select('gender')
    .eq('id', userId)
    .single()

  const gender = (profile?.gender as 'male' | 'female' | null) ?? null
  return (
    <ScreenBody>
      <SubscriptionScreen gender={gender} />
    </ScreenBody>
  )
}
