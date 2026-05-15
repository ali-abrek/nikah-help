import { inngest } from '@/lib/inngest/client'
import { createServerSupabase } from '@/lib/supabase/server'
import { getOpenAI, AI_BIO_PROMPT } from '@/lib/openai/client'
import { NonRetriableError } from 'inngest'
import { BIO_FIELDS_SQL, hashBioFields } from '@/lib/profile/bio-fields'

async function loadProfile(userId: string) {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('profiles')
    .select(`ai_bio, ai_bio_input_hash, ${BIO_FIELDS_SQL}`)
    .eq('id', userId)
    .single<Record<string, unknown> & { ai_bio: string | null; ai_bio_input_hash: string | null }>()

  if (error || !data) throw new NonRetriableError('Profile not found')
  return data
}

async function persistAiBio(
  userId: string,
  bio: string,
  metaDescription: string | null,
  inputHash: string,
) {
  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from('profiles')
    .update({
      ai_bio: bio,
      meta_description: metaDescription,
      ai_bio_status: 'ready',
      ai_bio_input_hash: inputHash,
    })
    .eq('id', userId)

  if (error) throw error
}

export const profileRegenerateBioFn = inngest.createFunction(
  {
    id: 'profile.regenerate-bio',
    retries: 3,
    // Only one regen at a time per user — concurrent requests for the same
    // user serialise so OpenAI sees one in-flight call instead of N.
    concurrency: { limit: 1, key: 'event.data.userId' },
    rateLimit: { limit: 3, period: '24h', key: 'event.data.userId' },
    triggers: { event: 'profile/regenerate-bio' },
  },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string }

    const profile = await step.run('load-profile', () => loadProfile(userId))
    const inputHash = hashBioFields(profile)

    // Short-circuit: a prior worker may have already produced this exact bio
    // (e.g. user undid an edit). Skip the OpenAI call entirely.
    if (profile.ai_bio && profile.ai_bio_input_hash === inputHash) {
      await step.run('mark-ready', async () => {
        const supabase = await createServerSupabase()
        await supabase.from('profiles').update({ ai_bio_status: 'ready' }).eq('id', userId)
      })
      return { success: true, userId, skipped: true }
    }

    const completion = await step.run('openai-generate', () =>
      getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: AI_BIO_PROMPT },
          {
            role: 'user',
            content: `Создай биографию для пользователя на основе следующих данных:\n\n${JSON.stringify(profile, null, 2)}`,
          },
        ],
        max_tokens: 500,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    )

    const raw = completion.choices[0]?.message?.content?.trim()

    if (!raw) {
      throw new Error('OpenAI returned empty response')
    }

    let parsed: { bio?: string; meta_description?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = { bio: raw }
    }

    const bio = parsed.bio?.trim()
    const metaDescription = parsed.meta_description?.trim() ?? null

    if (!bio) {
      throw new Error('OpenAI returned empty bio')
    }

    await step.run('persist', () => persistAiBio(userId, bio, metaDescription, inputHash))

    return { success: true, userId }
  },
)
