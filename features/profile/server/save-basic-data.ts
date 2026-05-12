import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { OnboardingStep1Data } from '../schemas'
import { maybeRegenerateBio } from './maybe-regenerate-bio'

export async function saveBasicData(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: OnboardingStep1Data,
) {
  const updateData: Database['public']['Tables']['profiles']['Update'] = {
    name: data.name,
    birth_date: data.birth_date,
    gender: data.gender,
    country: data.country,
    city: data.city,
    nationality: data.nationality,
    height: data.height,
    weight: data.weight,
  }

  if (!data.allow_geolocation) {
    updateData.location = null
  }

  const { error } = await supabase.from('profiles').update(updateData).eq('id', userId)

  // PostgREST auth-code mapping (42501, PGRST301, …) is handled centrally in
  // handleActionError — re-throw so the action wrapper can classify.
  if (error) throw error

  // Bio regen is a no-op until onboarding is completed; safe to call from
  // both the wizard's step-1 save and post-onboarding edits.
  await maybeRegenerateBio(supabase, userId)
}
