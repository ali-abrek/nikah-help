import { inngest } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenAI } from '@/lib/openai/client'
import { STORAGE } from '@/lib/image-processing/photo-variants'
import { NonRetriableError } from 'inngest'

interface ModerationScores {
  explicit_nudity_score: number
  suggestive_score: number
  violence_score: number
  hate_symbols_score: number
  face_count: number
  detected_gender: string
  reason: string
}

async function downloadCover(photoId: string): Promise<{ buffer: Buffer; contentType: string }> {
  const supabase = createAdminClient()

  const { data: photo, error: fetchError } = await supabase
    .from('photos')
    .select('profile_id, variants')
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

  const { data: file, error } = await supabase
    .storage
    .from(STORAGE.bucket)
    .download(coverPath)

  if (error || !file) {
    throw new Error(`Failed to download cover: ${error?.message ?? 'unknown'}`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  return { buffer, contentType: 'image/webp' }
}

function evaluateModeration(scores: ModerationScores): 'approved' | 'rejected' | 'manual_review' {
  if (scores.explicit_nudity_score >= 90) return 'rejected'
  if (scores.suggestive_score >= 85) return 'rejected'
  if (scores.violence_score >= 90) return 'rejected'
  if (scores.hate_symbols_score >= 95) return 'rejected'
  if (scores.face_count !== 1) return 'rejected'

  return 'approved'
}

async function updateModerationStatus(
  photoId: string,
  status: 'approved' | 'rejected' | 'manual_review',
  result: ModerationScores,
) {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('photos')
    .update({
      moderation_status: status,
      moderation_result: result as never,
      moderation_reason: status === 'rejected' ? result.reason : null,
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
  },
  async ({ event, step }) => {
    const { photoId } = event.data as { photoId: string }

    const { buffer } = await step.run('download-cover', () => downloadCover(photoId))

    const result = await step.run('moderate', async () => {
      const buf = buffer as unknown as Buffer
      const base64 = buf.toString('base64')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (getOpenAI().chat.completions as any).create({
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

      const content = response.choices[0]?.message?.content
      if (!content) throw new Error('OpenAI returned empty response')

      return JSON.parse(content) as ModerationScores
    })

    const decision = evaluateModeration(result)

    await step.run('update-status', () => updateModerationStatus(photoId, decision, result))

    return { photoId, decision, scores: result }
  },
)
