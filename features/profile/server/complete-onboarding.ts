import { createServerSupabase } from '@/lib/supabase/server'

export async function completeOnboarding(userId: string) {
  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('id', userId)

  if (error) throw error
}
