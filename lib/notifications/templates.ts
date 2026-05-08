import type { NotificationType } from './types'
import { AppError } from '@/lib/errors/app-error'

interface TemplateKeys {
  titleKey: string
  bodyKey: string
}

const TEMPLATE_MAP: Record<NotificationType, TemplateKeys> = {
  like_received: {
    titleKey: 'notifications.like_received.title',
    bodyKey: 'notifications.like_received.body',
  },
  like_revoked: {
    titleKey: 'notifications.like_revoked.title',
    bodyKey: 'notifications.like_revoked.body',
  },
  match_created: {
    titleKey: 'notifications.match_created.title',
    bodyKey: 'notifications.match_created.body',
  },
  message_new: {
    titleKey: 'notifications.message_new.title',
    bodyKey: 'notifications.message_new.body',
  },
  photo_approved: {
    titleKey: 'notifications.photo_approved.title',
    bodyKey: 'notifications.photo_approved.body',
  },
  photo_rejected: {
    titleKey: 'notifications.photo_rejected.title',
    bodyKey: 'notifications.photo_rejected.body',
  },
  photo_removed_by_moderator: {
    titleKey: 'notifications.photo_removed_by_moderator.title',
    bodyKey: 'notifications.photo_removed_by_moderator.body',
  },
  account_blocked: {
    titleKey: 'notifications.account_blocked.title',
    bodyKey: 'notifications.account_blocked.body',
  },
  account_reinstated: {
    titleKey: 'notifications.account_reinstated.title',
    bodyKey: 'notifications.account_reinstated.body',
  },
  account_suspension_expired: {
    titleKey: 'notifications.account_suspension_expired.title',
    bodyKey: 'notifications.account_suspension_expired.body',
  },
  inactivity_warning: {
    titleKey: 'notifications.inactivity_warning.title',
    bodyKey: 'notifications.inactivity_warning.body',
  },
}

export function resolveTemplate(type: NotificationType): TemplateKeys {
  const template = TEMPLATE_MAP[type]
  if (!template) {
    throw new AppError('SYSTEM_INTERNAL_ERROR', {
      message: `No template defined for notification type: ${type}`,
      logContext: { notificationType: type },
    })
  }
  return template
}
