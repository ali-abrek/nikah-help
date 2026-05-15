import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserId } from '@/lib/auth/claims'
import { OnboardingWizard } from '@/features/profile/components/onboarding-wizard'
import type {
  OnboardingStep1Data,
  OnboardingStep2MaleData,
  OnboardingStep2FemaleData,
} from '@/features/profile/schemas'

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
    .select(
      `locale, name, birth_date, gender, country, city, nationality, height, weight,
       marital_status, children_count, income_level, housing, willing_to_relocate,
       polygyny_attitude, hijab_attitude, about_self`,
    )
    .eq('id', userId)
    .single()

  const { data: photos } = await supabase
    .from('photos')
    .select('id, position, moderation_status')
    .eq('profile_id', userId)
    .neq('moderation_status', 'rejected')
    .order('position', { ascending: true })

  const locale = (profile?.locale as string) ?? 'ru'
  const isEditMode = !!profile?.name

  const initialStep1Data: Partial<OnboardingStep1Data> | undefined = isEditMode
    ? {
        name: profile.name ?? undefined,
        birth_date: profile.birth_date ?? undefined,
        gender: (profile.gender as 'male' | 'female') ?? undefined,
        country: profile.country ?? undefined,
        city: profile.city ?? undefined,
        nationality: profile.nationality ?? undefined,
        height: profile.height ?? undefined,
        weight: profile.weight ?? undefined,
        allow_geolocation: true,
      }
    : undefined

  const step2Base = isEditMode
    ? {
        marital_status: (profile.marital_status as OnboardingStep2MaleData['marital_status']) ?? undefined,
        children_count: profile.children_count ?? undefined,
        about_self: profile.about_self ?? undefined,
      }
    : undefined

  const initialStep2Data:
    | Partial<OnboardingStep2MaleData | OnboardingStep2FemaleData>
    | undefined =
    isEditMode && step2Base
      ? profile.gender === 'female'
        ? {
            ...step2Base,
            willing_to_relocate:
              (profile.willing_to_relocate as OnboardingStep2FemaleData['willing_to_relocate']) ??
              undefined,
            polygyny_attitude:
              (profile.polygyny_attitude as OnboardingStep2FemaleData['polygyny_attitude']) ??
              undefined,
            hijab_attitude:
              (profile.hijab_attitude as OnboardingStep2FemaleData['hijab_attitude']) ?? undefined,
          }
        : {
            ...step2Base,
            income_level:
              (profile.income_level as OnboardingStep2MaleData['income_level']) ?? undefined,
            housing: (profile.housing as OnboardingStep2MaleData['housing']) ?? undefined,
          }
      : undefined

  const initialPhotos = (photos ?? []) as {
    id: string
    position: number
    moderation_status: string
  }[]

  return (
    <OnboardingWizard
      locale={locale}
      isEditMode={isEditMode}
      initialStep1Data={initialStep1Data}
      initialStep2Data={initialStep2Data}
      initialPhotos={initialPhotos}
    />
  )
}
