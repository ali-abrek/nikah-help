import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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

  const userId = (data.claims as Record<string, unknown>).sub as string
  const { data: profile } = await supabase
    .from('profiles')
    .select('locale')
    .eq('id', userId)
    .single()

  const locale = (profile?.locale as string) ?? 'ru'

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-foreground">Заполните профиль</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Шаг за шагом — это займёт всего пару минут
        </p>
      </div>
      <OnboardingWizard locale={locale} />
    </div>
  )
}
