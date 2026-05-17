import { inngest, photoModerateEvent, notificationSendEvent } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenAI } from '@/lib/openai/client'
import { STORAGE } from '@/lib/image-processing/photo-variants'
import { NonRetriableError } from 'inngest'
import { captureSentryException } from '@/lib/sentry/capture'
import { createNotification } from '@/lib/notifications/factory'
import {
  evaluateModeration,
  cleanupRejectedPhoto,
  insertNotificationDirect,
} from '@/lib/image-processing/moderate-photo'
import type { ModerationScores, ModerationDecision } from '@/lib/image-processing/moderate-photo'

async function loadPhotoContext(photoId: string): Promise<{
  buffer: Buffer
  contentType: string
  profileGender: 'male' | 'female' | null
  profileId: string
  userId: string
}> {
  const supabase = createAdminClient()

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

  const joined = (photo as unknown as { profiles: { gender: string } | { gender: string }[] })
    .profiles
  const profileGender = (Array.isArray(joined) ? joined[0]?.gender : joined?.gender) as
    | 'male'
    | 'female'
    | undefined

  return {
    buffer,
    contentType: 'image/webp',
    profileGender: profileGender ?? null,
    profileId: (photo as unknown as { profile_id: string }).profile_id,
    userId: (photo as unknown as { profile_id: string }).profile_id,
  }
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
    // Idempotency: only act on photos that haven't been moderated yet.
    // If the synchronous path in /api/photos/process already handled this,
    // the status won't be 'queued' and we skip.
    .eq('moderation_status', 'queued')

  if (error) throw error
}

export const photoModerateFn = inngest.createFunction(
  {
    id: 'photo.moderate',
    retries: 3,
    triggers: [photoModerateEvent],
    onFailure: async ({ event, error }) => {
      const { photoId } = event.data as { photoId?: string }
      await captureSentryException(error, {
        flow: 'moderation.vision',
        severity: 'error',
        tags: { step: 'retry_exhausted' },
        extra: { photoId: photoId ?? 'unknown' },
      })
    },
  },
  async ({ event, step }) => {
    const { photoId } = event.data

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
          model: 'gpt-4o-mini',
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

    if (decision.status === 'rejected') {
      await step.run('notify-user', async () => {
        const payload = createNotification('photo_auto_rejected', {
          recipientId: ctx.profileId,
          photoId,
          reason: decision.reason ?? result.reason ?? 'auto_rejected',
          entityId: photoId,
          entityType: 'photo',
        })
        const dedupeKey = `photo_auto_rejected:${photoId}`

        // Direct insert guarantees in-app delivery; Inngest send only handles
        // push/email channels and is dedupe-safe via the same key.
        await insertNotificationDirect(payload, ctx.profileId, dedupeKey)

        try {
          await inngest.send(
            notificationSendEvent.create({
              type: 'photo_auto_rejected',
              payload: payload as unknown,
              userId: ctx.profileId,
              dedupeKey,
            }),
          )
        } catch (err) {
          void captureSentryException(err, {
            flow: 'moderation.vision',
            severity: 'error',
            tags: { step: 'notify_user' },
            extra: { photoId, logContext: { profileId: ctx.profileId } },
          })
        }
      })

      await step.run('cleanup-rejected', () => cleanupRejectedPhoto(photoId, ctx.userId))
    }

    return { photoId, decision, scores: result }
  },
)
