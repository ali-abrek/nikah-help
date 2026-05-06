import { createServerSupabase } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'
import type { OnboardingStep1Data } from '../schemas'

export async function saveBasicData(userId: string, data: OnboardingStep1Data) {
  const supabase = await createServerSupabase()

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

  // When geo is disabled, explicitly clear any previous location.
  // When enabled, leave the column unchanged — actual coords are resolved
  // and stored separately via client-side geolocation.
  if (!data.allow_geolocation) {
    updateData.location = null
  }

  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', userId)

  if (error) throw error
}
