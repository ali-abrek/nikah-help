// ── Notification Types ───────────────────────────────────────────

export type NotificationType =
  // Social
  | 'like_received'
  | 'match_created'
  | 'message_new'
  | 'like_revoked'
  // Moderation
  | 'photo_approved'
  | 'photo_rejected'
  | 'photo_removed_by_moderator'
  | 'account_blocked'
  | 'account_reinstated'
  | 'account_suspension_expired'
  // System
  | 'inactivity_warning'

// ── Context (dynamic data) ───────────────────────────────────────

export interface NotificationContext {
  recipientId: string
  actorId?: string
  actorName?: string
  entityId?: string
  entityType?: 'profile' | 'photo' | 'match' | 'message' | 'chat'
  photoId?: string
  matchId?: string
  messageId?: string
  chatId?: string
  reason?: string
  banDuration?: string
}

// ── Options ──────────────────────────────────────────────────────

export interface NotificationOptions {
  locale?: 'ru' | 'en'
  channels?: Channel[]
  priority?: 'high' | 'normal' | 'low'
  ttl?: number
}

export type Channel = 'in_app' | 'email' | 'push'

// ── Output Payload ───────────────────────────────────────────────

export interface NotificationPayload {
  title_key: string
  body_key: string
  payload: {
    type: NotificationType
    actor_id?: string
    actor_name?: string
    entity_id?: string
    entity_type?: string
    link?: string
    reason?: string
    ban_duration?: string
    photo_id?: string
    timestamp: string
  }
}
