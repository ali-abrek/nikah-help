import type { NotificationType, NotificationContext, NotificationPayload } from './types'
import { resolveTemplate } from './templates'
import { resolveLink } from './links'
import { validateContext } from './validation'

export function createNotification(
  type: NotificationType,
  context: NotificationContext,
): NotificationPayload {
  validateContext(type, context)

  const { titleKey, bodyKey } = resolveTemplate(type)
  const link = resolveLink(type, context)

  return {
    title_key: titleKey,
    body_key: bodyKey,
    payload: {
      type,
      actor_id: context.actorId,
      actor_name: context.actorName,
      entity_id: context.entityId,
      entity_type: context.entityType,
      link,
      reason: context.reason,
      ban_duration: context.banDuration,
      photo_id: context.photoId,
      timestamp: new Date().toISOString(),
    },
  }
}
