import type { NotificationType, NotificationContext } from './types'
import { AppError } from '@/lib/errors/app-error'

const REQUIRED_FIELDS: Record<NotificationType, (keyof NotificationContext)[]> = {
  like_received:              ['recipientId', 'actorId', 'actorName', 'entityId'],
  match_created:              ['recipientId', 'actorId', 'actorName', 'matchId'],
  message_new:                ['recipientId', 'actorId', 'actorName', 'messageId', 'chatId'],
  like_revoked:               ['recipientId', 'actorId', 'entityId'],
  photo_approved:             ['recipientId', 'photoId'],
  photo_rejected:             ['recipientId', 'photoId', 'reason'],
  photo_removed_by_moderator: ['recipientId', 'photoId', 'reason'],
  account_blocked:            ['recipientId', 'reason'],
  account_reinstated:         ['recipientId'],
  account_suspension_expired: ['recipientId'],
  inactivity_warning:         ['recipientId'],
}

export function validateContext(
  type: NotificationType,
  context: NotificationContext,
): void {
  const required = REQUIRED_FIELDS[type]
  const missing = required.filter((field) => context[field] == null)

  if (missing.length > 0) {
    throw new AppError('VALIDATION_INVALID_INPUT', {
      message: `Missing required context fields for ${type}: ${missing.join(', ')}`,
      details: Object.fromEntries(missing.map((f) => [f, 'Required'])),
      logContext: { notificationType: type, missing },
    })
  }
}
