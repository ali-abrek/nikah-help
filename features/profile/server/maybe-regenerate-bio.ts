import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { inngest, profileRegenerateBioEvent } from '@/lib/inngest/client'
import { BIO_FIELDS_SQL, hashBioFields } from '@/lib/profile/bio-fields'

/**
 * Re-emit the bio regeneration event when bio-relevant fields actually
 * changed AND the user has already completed onboarding. During the
 * onboarding flow the bio is generated synchronously by `generateBio()`
 * at step 4, so we deliberately skip the event there.
 *
 * Hashes are stored on `profiles.ai_bio_input_hash`; if it matches the
 * post-update hash we no-op so back-and-forth edits don't burn the
 * 3-per-day Inngest rate limit (rateLimit configured in
 * profile-regenerate-bio.ts).
 */
export async function maybeRegenerateBio(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select(`onboarding_completed, ai_bio_input_hash, ${BIO_FIELDS_SQL}`)
    .eq('id', userId)
    .single<
      Record<string, unknown> & {
        onboarding_completed?: boolean
        ai_bio_input_hash?: string | null
      }
    >()

  if (!profile?.onboarding_completed) return

  const newHash = hashBioFields(profile)
  if (profile.ai_bio_input_hash === newHash) return

  await supabase
    .from('profiles')
    .update({ ai_bio_input_hash: newHash, ai_bio_status: 'pending' })
    .eq('id', userId)

  // The Inngest worker reserves the daily quota slot before calling OpenAI;
  // this Server Action just queues the event.
  await inngest.send(profileRegenerateBioEvent.create({ userId }))
}
