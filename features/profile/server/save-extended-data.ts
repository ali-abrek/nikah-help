import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { OnboardingStep2MaleData, OnboardingStep2FemaleData } from '../schemas'
import { maybeRegenerateBio } from './maybe-regenerate-bio'

type Step2Data = (OnboardingStep2MaleData | OnboardingStep2FemaleData) & {
  gender: 'male' | 'female'
}

export async function saveExtendedData(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: Step2Data,
) {
  const base = {
    marital_status: data.marital_status,
    children_count: data.children_count,
    about_self: data.about_self,
  }

  const gendered =
    data.gender === 'male'
      ? {
          income_level: (data as OnboardingStep2MaleData).income_level,
          housing: (data as OnboardingStep2MaleData).housing,
        }
      : {
          willing_to_relocate: (data as OnboardingStep2FemaleData).willing_to_relocate,
          polygyny_attitude: (data as OnboardingStep2FemaleData).polygyny_attitude,
          hijab_attitude: (data as OnboardingStep2FemaleData).hijab_attitude,
        }

  const { error } = await supabase
    .from('profiles')
    .update({ ...base, ...gendered })
    .eq('id', userId)

  // PostgREST auth-code mapping (42501, PGRST301, …) is handled centrally in
  // handleActionError — re-throw so the action wrapper can classify.
  if (error) throw error

  await maybeRegenerateBio(supabase, userId)
}
