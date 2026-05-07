import { createServerSupabase } from '@/lib/supabase/server'
import { BIO_FIELDS_SQL, hashBioFields } from '@/lib/profile/bio-fields'

export async function completeOnboarding(userId: string) {
  const supabase = await createServerSupabase()

  // Snapshot the bio-relevant inputs so post-onboarding edits can detect
  // actual changes and skip a redundant OpenAI call.
  const { data: profile } = await supabase
    .from('profiles')
    .select(BIO_FIELDS_SQL)
    .eq('id', userId)
    .single<Record<string, unknown>>()

  const initialHash = profile ? hashBioFields(profile) : null

  const { error } = await supabase
    .from('profiles')
    .update({
      onboarding_completed: true,
      ai_bio_input_hash: initialHash,
    })
    .eq('id', userId)

  if (error) throw error
}
