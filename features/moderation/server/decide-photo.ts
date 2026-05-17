import { createAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'
import { inngest } from '@/lib/inngest/client'
import { createNotification } from '@/lib/notifications/factory'
import { captureSentryException } from '@/lib/sentry/capture'
import { cleanupManualRejectedVariants } from '@/lib/image-processing/moderate-photo'

export type ModerationDecisionInput = 'approve' | 'reject'

interface DecideArgs {
  photoId: string
  moderatorId: string
  decision: ModerationDecisionInput
  reason?: string
}

/**
 * Atomically moves a photo from manual_review → approved or rejected.
 * Only photos currently in manual_review are eligible — re-deciding an
 * already-resolved photo returns NOT_FOUND so duplicate clicks from two
 * moderators can't double-notify the user.
 */
export async function decidePhoto({
  photoId,
  moderatorId,
  decision,
  reason,
}: DecideArgs): Promise<{ profileId: string }> {
  const supabase = createAdminClient()

  const nextStatus: 'approved' | 'rejected' = decision === 'approve' ? 'approved' : 'rejected'
  const nextReason =
    decision === 'reject' ? (reason && reason.length > 0 ? reason : 'moderator_rejected') : null

  const { data: updated, error } = await supabase
    .from('photos')
    .update({
      moderation_status: nextStatus,
      moderation_reason: nextReason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', photoId)
    .eq('moderation_status', 'manual_review')
    .select('id, profile_id')
    .maybeSingle()

  if (error) {
    throw new AppError('PHOTO_MODERATION_FAILED', {
      cause: error,
      logContext: { photoId, moderatorId, decision },
    })
  }
  if (!updated) {
    throw new AppError('NOT_FOUND', {
      message: 'Photo is not in the manual_review queue (already decided or removed)',
      logContext: { photoId, moderatorId, decision },
    })
  }

  if (decision === 'reject') {
    const payload = createNotification('photo_rejected', {
      recipientId: updated.profile_id,
      photoId: updated.id,
      reason: nextReason ?? 'moderator_rejected',
      entityId: updated.id,
      entityType: 'photo',
    })

    try {
      await inngest.send({
        name: 'notification/send',
        data: {
          type: 'photo_rejected',
          payload,
          userId: updated.profile_id,
          dedupeKey: `photo_rejected:${updated.id}`,
        },
      })
    } catch (err) {
      // The DB state is already authoritative — log and continue rather than
      // failing the moderator's action over a transient queue hiccup.
      void captureSentryException(err, {
        flow: 'moderation.action',
        severity: 'error',
        tags: { step: 'notify_user' },
        extra: { photoId, logContext: { moderatorId } },
      })
    }

    // Delete all variant files from Storage except the avatar thumbnail,
    // which is kept for rejection notifications in the user's message center.
    try {
      await cleanupManualRejectedVariants(updated.id, updated.profile_id)
    } catch (err) {
      void captureSentryException(err, {
        flow: 'moderation.action',
        severity: 'warning',
        tags: { step: 'cleanup_variants' },
        extra: { photoId: updated.id, logContext: { moderatorId } },
      })
    }
  }

  return { profileId: updated.profile_id }
}
