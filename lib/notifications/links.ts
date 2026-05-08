import type { NotificationType, NotificationContext } from './types'

export function resolveLink(
  type: NotificationType,
  context: NotificationContext,
): string | undefined {
  switch (type) {
    case 'like_received':
      return context.actorId ? `/profiles/${context.actorId}` : undefined

    case 'match_created':
      return context.matchId ? `/matches/${context.matchId}` : undefined

    case 'message_new':
      return context.chatId ? `/chat/${context.chatId}` : undefined

    case 'like_revoked':
      return undefined

    case 'photo_approved':
    case 'photo_rejected':
      return '/settings/photos'

    case 'photo_removed_by_moderator':
      return '/settings/photos'

    case 'account_blocked':
      return undefined

    case 'account_reinstated':
    case 'account_suspension_expired':
      return '/feed'

    case 'inactivity_warning':
      return '/feed'

    default:
      return undefined
  }
}
