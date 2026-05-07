import { inngest } from '@/lib/inngest/client'
import { createServerSupabase } from '@/lib/supabase/server'
import { getOpenAI, AI_BIO_PROMPT } from '@/lib/openai/client'
import { NonRetriableError } from 'inngest'
import { BIO_FIELDS_SQL } from '@/lib/profile/bio-fields'

async function loadProfile(userId: string) {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('profiles')
    .select(BIO_FIELDS_SQL)
    .eq('id', userId)
    .single<Record<string, unknown>>()

  if (error || !data) throw new NonRetriableError('Profile not found')
  return data
}

async function updateAiBio(userId: string, bio: string) {
  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from('profiles')
    .update({ ai_bio: bio, ai_bio_status: 'ready' })
    .eq('id', userId)

  if (error) throw error
}

export const profileRegenerateBioFn = inngest.createFunction(
  {
    id: 'profile.regenerate-bio',
    retries: 3,
    concurrency: { limit: 50, key: 'event.data.userId' },
    rateLimit: { limit: 3, period: '24h', key: 'event.data.userId' },
    triggers: { event: 'profile/regenerate-bio' },
  },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string }

    const profile = await step.run('load-profile', () => loadProfile(userId))

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
        max_tokens: 300,
        temperature: 0.7,
      }),
    )

    const bio = completion.choices[0]?.message?.content?.trim()

    if (!bio) {
      throw new Error('OpenAI returned empty bio')
    }

    await step.run('persist', () => updateAiBio(userId, bio))

    return { success: true, userId }
  },
)
