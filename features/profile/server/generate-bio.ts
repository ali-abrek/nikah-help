import { createServerSupabase } from '@/lib/supabase/server'
import { getOpenAI, AI_BIO_PROMPT } from '@/lib/openai/client'

export async function generateBio(userId: string): Promise<string> {
  const supabase = await createServerSupabase()

  // Atomically claim the regenerate lock — only if no regeneration is in flight.
  // This avoids duplicate OpenAI calls from concurrent requests.
  const { error: lockError, count } = await supabase
    .from('profiles')
    .update({ ai_bio_status: 'regenerating' }, { count: 'exact' })
    .eq('id', userId)
    .or('ai_bio_status.is.null,ai_bio_status.neq.regenerating')

  if (lockError) throw lockError
  if (count === 0) throw new Error('Bio regeneration already in progress')

  // Fetch profile data for the bio prompt
  const { data: profile, error } = await supabase
    .from('profiles')
    .select(
      'name, gender, birth_date, country, city, nationality, education, ' +
      'marital_status, children_count, income_level, housing, ' +
      'willing_to_relocate, polygyny_attitude, hijab_attitude, about_self',
    )
    .eq('id', userId)
    .single<{
      name: string | null
      gender: string | null
      birth_date: string | null
      country: string | null
      city: string | null
      nationality: string | null
      education: string | null
      marital_status: string | null
      children_count: number | null
      income_level: string | null
      housing: string | null
      willing_to_relocate: boolean | null
      polygyny_attitude: string | null
      hijab_attitude: string | null
      about_self: string | null
    }>()

  if (error || !profile) {
    // Release lock on error
    await supabase
      .from('profiles')
      .update({ ai_bio_status: 'ready' })
      .eq('id', userId)
    throw new Error('Profile not found')
  }

  const age = profile.birth_date
    ? Math.floor(
        (Date.now() - new Date(profile.birth_date).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
      )
    : undefined

  const bioInput = {
    ...profile,
    age,
    gender_label: profile.gender === 'male' ? 'мужчина' : 'женщина',
  }

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system' as const, content: AI_BIO_PROMPT },
      {
        role: 'user' as const,
        content: `Создай биографию для пользователя на основе следующих данных:\n\n${JSON.stringify(bioInput, null, 2)}`,
      },
    ],
    max_tokens: 300,
    temperature: 0.7,
  })

  const bio = completion.choices[0]?.message?.content?.trim()

  if (!bio) {
    // Release lock on empty response
    await supabase
      .from('profiles')
      .update({ ai_bio_status: 'ready' })
      .eq('id', userId)
    throw new Error('Failed to generate bio')
  }

  await supabase
    .from('profiles')
    .update({
      ai_bio: bio,
      ai_bio_status: 'ready',
    })
    .eq('id', userId)

  return bio
}
