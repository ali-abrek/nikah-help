import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserId } from '@/lib/auth/claims'
import { OnboardingWizard } from '@/features/profile/components/onboarding-wizard'

export const metadata = {
  title: 'Онбординг — Nikah Help',
}

export default async function OnboardingPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    redirect('/auth')
  }

  const userId = getUserId(data.claims as Record<string, unknown>)
  if (!userId) redirect('/auth')

  const { data: profile } = await supabase
    .from('profiles')
    .select('locale')
    .eq('id', userId)
    .single()

  const locale = (profile?.locale as string) ?? 'ru'

  return <OnboardingWizard locale={locale} />
}
