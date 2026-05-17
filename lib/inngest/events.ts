import { eventType, staticSchema } from 'inngest'

// ── Photo events ──────────────────────────────────────────────

export const photoModerateEvent = eventType('photo/moderate', {
  schema: staticSchema<{ photoId: string }>(),
})

export const photoProcessEvent = eventType('photo/process', {
  schema: staticSchema<{ photoId: string }>(),
})

export const photoDeleteEvent = eventType('photo/delete', {
  schema: staticSchema<{ photoId: string; userId: string }>(),
})

export const photoAbandonCleanupEvent = eventType('photo/abandon-cleanup', {
  schema: staticSchema<{ photoId: string; storagePath: string }>(),
})

export const photoReplaceCleanupEvent = eventType('photo/replace-cleanup', {
  schema: staticSchema<{ oldPhotoId: string; userId: string }>(),
})

// ── Chat events ───────────────────────────────────────────────

export const chatDeleteEvent = eventType('chat/delete', {
  schema: staticSchema<{
    chatId: string
    matchId: string
    mediaPaths?: string[]
  }>(),
})

// ── Like events ───────────────────────────────────────────────

export const likeRevokeEvent = eventType('like/revoke', {
  schema: staticSchema<{
    matchId: string
    userId: string
    otherUserId: string
  }>(),
})

// ── Notification events ───────────────────────────────────────

export const notificationSendEvent = eventType('notification/send', {
  schema: staticSchema<{
    type: string
    payload: unknown
    userId: string
    channels?: string[]
    dedupeKey?: string
  }>(),
})

// ── Profile events ────────────────────────────────────────────

export const profileRegenerateBioEvent = eventType('profile/regenerate-bio', {
  schema: staticSchema<{ userId: string }>(),
})
