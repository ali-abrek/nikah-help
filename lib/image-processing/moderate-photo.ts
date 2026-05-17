import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenAI } from '@/lib/openai/client'
import { STORAGE, PHOTO_VARIANTS, FORMATS, buildStoragePath } from '@/lib/image-processing/photo-variants'
import { inngest } from '@/lib/inngest/client'
import { createNotification } from '@/lib/notifications/factory'
import { captureSentryException } from '@/lib/sentry/capture'

// ── Types ──────────────────────────────────────────────────────────

export interface ModerationScores {
  explicit_nudity_score: number
  suggestive_score: number
  violence_score: number
  hate_symbols_score: number
  face_count: number
  detected_gender: string
  reason: string
}

export interface ModerationDecision {
  status: 'approved' | 'rejected' | 'manual_review'
  reason?: string
}

// Thresholds tuned for a Muslim matrimonial app.
const REJECT = {
  explicit_nudity: 65,
  suggestive: 70,
  violence: 75,
  hate_symbols: 65,
} as const

const REVIEW = {
  explicit_nudity: 45,
  suggestive: 50,
  violence: 55,
  hate_symbols: 40,
} as const

// ── Evaluation (pure) ──────────────────────────────────────────────

export function evaluateModeration(
  scores: ModerationScores,
  profileGender: 'male' | 'female' | null,
): ModerationDecision {
  // Hard rejects — high confidence of disallowed content.
  if (scores.explicit_nudity_score >= REJECT.explicit_nudity) {
    return { status: 'rejected', reason: 'explicit_nudity' }
  }
  if (scores.suggestive_score >= REJECT.suggestive) {
    return { status: 'rejected', reason: 'suggestive_content' }
  }
  if (scores.violence_score >= REJECT.violence) {
    return { status: 'rejected', reason: 'violence' }
  }
  if (scores.hate_symbols_score >= REJECT.hate_symbols) {
    return { status: 'rejected', reason: 'hate_symbols' }
  }
  if (scores.face_count !== 1) {
    return { status: 'rejected', reason: 'face_count_invalid' }
  }

  // Gender mismatch — must match the profile's declared gender.
  if (profileGender && scores.detected_gender === 'male' && profileGender !== 'male') {
    return { status: 'rejected', reason: 'gender_mismatch' }
  }
  if (profileGender && scores.detected_gender === 'female' && profileGender !== 'female') {
    return { status: 'rejected', reason: 'gender_mismatch' }
  }

  // Borderline band — send to human queue.
  if (
    scores.explicit_nudity_score >= REVIEW.explicit_nudity ||
    scores.suggestive_score >= REVIEW.suggestive
  ) {
    return { status: 'manual_review', reason: 'borderline_nudity' }
  }
  if (scores.violence_score >= REVIEW.violence) {
    return { status: 'manual_review', reason: 'potential_violence' }
  }
  if (scores.hate_symbols_score >= REVIEW.hate_symbols) {
    return { status: 'manual_review', reason: 'potential_hate_symbols' }
  }
  if (profileGender && scores.detected_gender === 'uncertain') {
    return { status: 'manual_review', reason: 'gender_uncertain' }
  }

  return { status: 'approved' }
}

// ── Photo context loader ───────────────────────────────────────────

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
    throw new Error(`Photo not found: ${photoId}`)
  }

  const variants = photo.variants as Record<string, { avif?: string; webp?: string }> | null
  const coverPath = variants?.cover?.webp

  if (!coverPath) {
    throw new Error(`Cover variant not found for photo: ${photoId}`)
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

// ── DB update ──────────────────────────────────────────────────────

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

// ── OpenAI call ────────────────────────────────────────────────────

async function callOpenAIModeration(buffer: Buffer): Promise<ModerationScores> {
  const base64 = buffer.toString('base64')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (getOpenAI().chat.completions as any).create({
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

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('OpenAI returned empty response')

  return JSON.parse(content) as ModerationScores
}

// ── Storage cleanup ────────────────────────────────────────────────

/** Delete ALL variant files + original from Storage, then delete the DB row. */
export async function cleanupRejectedPhoto(photoId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()

  // Gather all Storage paths to delete.
  const paths: string[] = []

  // Original (if still present).
  const { data: photo } = await supabase
    .from('photos')
    .select('storage_path')
    .eq('id', photoId)
    .maybeSingle()

  if (photo?.storage_path) {
    paths.push(photo.storage_path)
  }

  // All variants.
  for (const variant of Object.values(PHOTO_VARIANTS)) {
    for (const format of FORMATS) {
      paths.push(buildStoragePath(userId, photoId, variant, format))
    }
  }

  // Best-effort Storage deletion.
  if (paths.length > 0) {
    const { error: removeErr } = await supabase.storage.from(STORAGE.bucket).remove(paths)
    if (removeErr) {
      void captureSentryException(removeErr, {
        flow: 'moderation.cleanup',
        severity: 'warning',
        tags: { step: 'storage_remove_rejected' },
        extra: { photoId, logContext: { userId, pathsCount: paths.length } },
      })
    }
  }

  // Delete the DB row.
  const { error: deleteErr } = await supabase.from('photos').delete().eq('id', photoId)
  if (deleteErr) {
    void captureSentryException(deleteErr, {
      flow: 'moderation.cleanup',
      severity: 'error',
      tags: { step: 'db_delete_rejected' },
      extra: { photoId, logContext: { userId } },
    })
  }
}

/**
 * Delete all variant files from Storage EXCEPT the avatar (thumbnail),
 * which is kept for rejection notifications in the user's message center.
 */
export async function cleanupManualRejectedVariants(
  photoId: string,
  userId: string,
): Promise<void> {
  const supabase = createAdminClient()

  const paths: string[] = []

  for (const [key, variant] of Object.entries(PHOTO_VARIANTS)) {
    // Keep avatar (thumbnail) for notifications.
    if (key === 'avatar') continue

    for (const format of FORMATS) {
      paths.push(buildStoragePath(userId, photoId, variant, format))
    }
  }

  if (paths.length > 0) {
    const { error } = await supabase.storage.from(STORAGE.bucket).remove(paths)
    if (error) {
      void captureSentryException(error, {
        flow: 'moderation.cleanup',
        severity: 'warning',
        tags: { step: 'storage_remove_manual_rejected' },
        extra: { photoId, logContext: { userId, pathsCount: paths.length } },
      })
    }
  }
}

// ── Main moderation pipeline ───────────────────────────────────────

/**
 * Run the full moderation pipeline synchronously:
 * load photo → call OpenAI → evaluate → update DB.
 *
 * If the decision is `rejected`, also cleans up the DB row and all
 * Storage files, and sends a notification.
 */
export async function moderatePhoto(photoId: string): Promise<ModerationDecision> {
  const ctx = await loadPhotoContext(photoId)

  let result: ModerationScores
  try {
    result = await callOpenAIModeration(ctx.buffer)
  } catch (err) {
    void captureSentryException(err, {
      flow: 'moderation.vision',
      severity: 'error',
      tags: { step: 'openai_call' },
      extra: { photoId },
    })
    throw err
  }

  const decision = evaluateModeration(result, ctx.profileGender)

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

  if (decision.status === 'rejected') {
    // Send notification before cleanup so the payload references a valid photoId.
    const payload = createNotification('photo_auto_rejected', {
      recipientId: ctx.profileId,
      photoId,
      reason: decision.reason ?? result.reason ?? 'auto_rejected',
      entityId: photoId,
      entityType: 'photo',
    })

    try {
      await inngest.send({
        name: 'notification/send',
        data: {
          type: 'photo_auto_rejected',
          payload,
          userId: ctx.profileId,
          dedupeKey: `photo_auto_rejected:${photoId}`,
        },
      })
    } catch (err) {
      void captureSentryException(err, {
        flow: 'moderation.vision',
        severity: 'error',
        tags: { step: 'notify_user' },
        extra: { photoId, logContext: { profileId: ctx.profileId } },
      })
    }

    // Full cleanup: DB row + all Storage files.
    await cleanupRejectedPhoto(photoId, ctx.userId)
  }

  return decision
}
