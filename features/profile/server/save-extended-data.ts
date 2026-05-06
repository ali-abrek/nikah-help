import { createServerSupabase } from '@/lib/supabase/server'
import type { OnboardingStep2MaleData, OnboardingStep2FemaleData } from '../schemas'

type Step2Data = (OnboardingStep2MaleData | OnboardingStep2FemaleData) & {
  gender: 'male' | 'female'
}

export async function saveExtendedData(userId: string, data: Step2Data) {
  const supabase = await createServerSupabase()

  const base = {
    marital_status: data.marital_status,
    children_count: data.children_count,
    education: data.education,
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

  if (error) throw error
}
