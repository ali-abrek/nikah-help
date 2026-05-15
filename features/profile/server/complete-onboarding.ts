import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { BIO_FIELDS_SQL, hashBioFields } from '@/lib/profile/bio-fields'

export async function completeOnboarding(supabase: SupabaseClient<Database>, userId: string) {
  // Snapshot the bio-relevant inputs so post-onboarding edits can detect
  // actual changes and skip a redundant OpenAI call.
  const { data: profile } = await supabase
    .from('profiles')
    .select(BIO_FIELDS_SQL)
    .eq('id', userId)
    .single<Record<string, unknown>>()

  const initialHash = profile ? hashBioFields(profile) : null

  // Auto-publish on completion when the user has uploaded any non-rejected
  // photo. Moderation may still be running in the background; the feed
  // filters by `approved`, so the profile only becomes visible once a photo
  // is approved. This matches the user's intent ("I finished onboarding, my
  // profile should be live") without waiting on async vision moderation.
  const { count: nonRejectedCount } = await supabase
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', userId)
    .neq('moderation_status', 'rejected')

  const update: Database['public']['Tables']['profiles']['Update'] = {
    onboarding_completed: true,
    ai_bio_input_hash: initialHash,
  }
  if ((nonRejectedCount ?? 0) > 0) {
    update.is_published = true
  }

  const { error } = await supabase.from('profiles').update(update).eq('id', userId)

  if (error) throw error
}
