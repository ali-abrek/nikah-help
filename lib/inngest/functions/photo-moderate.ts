import { inngest } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenAI } from '@/lib/openai/client'
import { STORAGE } from '@/lib/image-processing/photo-variants'
import { NonRetriableError } from 'inngest'
import { captureSentryException } from '@/lib/sentry/capture'

interface ModerationScores {
  explicit_nudity_score: number
  suggestive_score: number
  violence_score: number
  hate_symbols_score: number
  face_count: number
  detected_gender: string
  reason: string
}

async function loadPhotoContext(photoId: string): Promise<{
  buffer: Buffer
  contentType: string
  profileGender: 'male' | 'female' | null
}> {
  const supabase = createAdminClient()

  // Pull the profile gender alongside the cover so we can enforce mismatch
  // in the same step (spec docs/06-image-processing.md:609 — gender mismatch
  // is a reject criterion). Joining via the FK avoids a second roundtrip.
  const { data: photo, error: fetchError } = await supabase
    .from('photos')
    .select('profile_id, variants, profiles!inner(gender)')
    .eq('id', photoId)
    .single()

  if (fetchError || !photo) {
    throw new NonRetriableError(`Photo not found: ${photoId}`)
  }

  const variants = photo.variants as Record<string, { avif?: string; webp?: string }> | null
  const coverPath = variants?.cover?.webp

  if (!coverPath) {
    throw new NonRetriableError(`Cover variant not found for photo: ${photoId}`)
  }

  const { data: file, error } = await supabase.storage.from(STORAGE.bucket).download(coverPath)

  if (error || !file) {
    throw new Error(`Failed to download cover: ${error?.message ?? 'unknown'}`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Supabase returns the joined relation as either an object or array depending
  // on the FK cardinality interpretation; normalise.
  const joined = (photo as unknown as { profiles: { gender: string } | { gender: string }[] })
    .profiles
  const profileGender = (Array.isArray(joined) ? joined[0]?.gender : joined?.gender) as
    | 'male'
    | 'female'
    | undefined

  return { buffer, contentType: 'image/webp', profileGender: profileGender ?? null }
}

interface ModerationDecision {
  status: 'approved' | 'rejected' | 'manual_review'
  reason?: string
}

function evaluateModeration(
  scores: ModerationScores,
  profileGender: 'male' | 'female' | null,
): ModerationDecision {
  if (scores.explicit_nudity_score >= 90) {
    return { status: 'rejected', reason: 'explicit_nudity' }
  }
  if (scores.suggestive_score >= 85) {
    return { status: 'rejected', reason: 'suggestive_content' }
  }
  if (scores.violence_score >= 90) {
    return { status: 'rejected', reason: 'violence' }
  }
  if (scores.hate_symbols_score >= 95) {
    return { status: 'rejected', reason: 'hate_symbols' }
  }
  if (scores.face_count !== 1) {
    return { status: 'rejected', reason: 'face_count_invalid' }
  }
  // Gender mismatch — the depicted person must match the profile's declared
  // gender. 'uncertain' falls through to manual_review rather than auto-reject.
  if (profileGender && scores.detected_gender === 'male' && profileGender !== 'male') {
    return { status: 'rejected', reason: 'gender_mismatch' }
  }
  if (profileGender && scores.detected_gender === 'female' && profileGender !== 'female') {
    return { status: 'rejected', reason: 'gender_mismatch' }
  }
  if (profileGender && scores.detected_gender === 'uncertain') {
    return { status: 'manual_review', reason: 'gender_uncertain' }
  }

  return { status: 'approved' }
}

async function updateModerationStatus(
  photoId: string,
  decision: ModerationDecision,
  result: ModerationScores,
) {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('photos')
    .update({
      moderation_status: decision.status,
      moderation_result: result as never,
      moderation_reason:
        decision.status === 'approved' ? null : (decision.reason ?? result.reason ?? null),
      updated_at: new Date().toISOString(),
    })
    .eq('id', photoId)

  if (error) throw error
}

export const photoModerateFn = inngest.createFunction(
  {
    id: 'photo.moderate',
    retries: 3,
    triggers: { event: 'photo/moderate' },
    onFailure: async ({ event, error }) => {
      const { photoId } = (event.data as { data?: { photoId?: string } }).data ?? {}
      await captureSentryException(error, {
        flow: 'moderation.vision',
        severity: 'error',
        tags: { step: 'retry_exhausted' },
        extra: { photoId: photoId ?? 'unknown' },
      })
    },
  },
  async ({ event, step }) => {
    const { photoId } = event.data as { photoId: string }

    const ctx = await step.run('load-photo-context', () => loadPhotoContext(photoId))
    const { buffer, profileGender } = ctx

    const result = await step.run('moderate', async () => {
      const buf = buffer as unknown as Buffer
      const base64 = buf.toString('base64')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let response: any
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response = await (getOpenAI().chat.completions as any).create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are a content moderation system for a Muslim marriage application.
Analyze the image against the following categories and return ONLY a JSON object (no other text):

{
  "explicit_nudity_score": 0-100 (nudity, genitalia, bare chest),
  "suggestive_score": 0-100 (provocative poses, lingerie, swimwear),
  "violence_score": 0-100 (blood, weapons, injuries, fighting),
  "hate_symbols_score": 0-100 (extremist symbols, hate group imagery),
  "face_count": number (how many human faces),
  "detected_gender": "male" or "female" or "uncertain",
  "reason": "Brief explanation in English"
}

Be strict with nudity and suggestive content — the application requires modest, Islamic-compliant photos.`,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/webp;base64,${base64}`,
                    detail: 'low',
                  },
                },
              ],
            },
          ],
          max_tokens: 300,
          temperature: 0,
        })
      } catch (err) {
        void captureSentryException(err, {
          flow: 'moderation.vision',
          severity: 'error',
          tags: { step: 'openai_call' },
          extra: { provider: 'openai', photoId },
        })
        throw err
      }

      const content = response.choices[0]?.message?.content
      if (!content) throw new Error('OpenAI returned empty response')

      return JSON.parse(content) as ModerationScores
    })

    const decision = evaluateModeration(result, profileGender)

    await step.run('update-status', async () => {
      try {
        await updateModerationStatus(photoId, decision, result)
      } catch (err) {
        void captureSentryException(err, {
          flow: 'moderation.action',
          severity: 'error',
          tags: { step: 'update_status' },
          extra: { photoId },
        })
        throw err
      }
    })

    return { photoId, decision, scores: result }
  },
)
