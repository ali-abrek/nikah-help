'use server'

import { z } from 'zod'
import { getServerUserId } from '@/lib/auth/claims'
import { AppError } from '@/lib/errors/app-error'
import { handleActionError } from '@/lib/errors/action'
import { requireStaff } from './server/require-staff'
import { decidePhoto } from './server/decide-photo'

const decideSchema = z.object({
  photoId: z.uuid(),
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(200).optional(),
})

export async function decideModerationPhotoAction(input: {
  photoId: string
  decision: 'approve' | 'reject'
  reason?: string
}) {
  try {
    const userId = await getServerUserId()
    if (!userId) throw new AppError('AUTH_UNAUTHORIZED')

    await requireStaff(userId, 'moderator')

    const parsed = decideSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        details: { input: 'Invalid moderation decision payload' },
      })
    }

    const { profileId } = await decidePhoto({
      photoId: parsed.data.photoId,
      moderatorId: userId,
      decision: parsed.data.decision,
      reason: parsed.data.reason,
    })

    return { success: true as const, data: { photoId: parsed.data.photoId, profileId } }
  } catch (error) {
    return handleActionError(error)
  }
}
