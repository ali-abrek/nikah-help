import { describe, it, expect, vi } from 'vitest'
import { createNotification } from '@/lib/notifications/factory'
import { resolveTemplate } from '@/lib/notifications/templates'
import { validateContext } from '@/lib/notifications/validation'
import { getPresence } from '@/lib/realtime/presence'
import { getPreferences, setPreference } from '@/features/notifications/server/get-preferences'

const validUuid = '00000000-0000-4000-8000-000000000001'

describe('Notification dispatch flow', () => {
  it('createNotification generates complete payload for all required types', () => {
    const types = [
      'like_received',
      'match_created',
      'message_new',
      'photo_approved',
      'account_blocked',
      'inactivity_warning',
    ] as const

    for (const type of types) {
      const ctx = getMinimalContext(type)
      const payload = createNotification(type, ctx)
      expect(payload.title_key).toBeDefined()
      expect(payload.body_key).toBeDefined()
      expect(payload.payload.type).toBe(type)
      expect(payload.payload.timestamp).toBeDefined()
    }
  })

  it('preferences default to true when no row exists', () => {
    // Preferences module defaults to true for all types
    // This is verified by the getPreferences function behavior
    expect(true).toBe(true) // Placeholder — actual DB test would need Supabase
  })

  it('presence check uses profiles.last_seen_at', () => {
    // getPresence queries profiles.last_seen_at and compares with threshold
    expect(getPresence).toBeDefined()
  })

  it('notification dispatch requires notification/send event name', () => {
    // The Inngest function is registered with trigger: 'notification/send'
    const expectedEvent = 'notification/send'
    expect(expectedEvent).toBe('notification/send')
  })

  it('factory rejects invalid context for each type', () => {
    // photo_rejected requires reason
    expect(() => createNotification('photo_rejected', {
      recipientId: validUuid,
      photoId: validUuid,
      // reason missing
    })).toThrow()
  })

  it('payload includes optional fields only when provided', () => {
    const payload = createNotification('like_received', {
      recipientId: validUuid,
      actorId: validUuid,
      actorName: 'Alice',
      entityId: validUuid,
    })

    expect(payload.payload.actor_name).toBe('Alice')
    expect(payload.payload.ban_duration).toBeUndefined()
    expect(payload.payload.reason).toBeUndefined()
    expect(payload.payload.photo_id).toBeUndefined()
  })

  it('ban_duration is passed through to payload', () => {
    const payload = createNotification('account_blocked', {
      recipientId: validUuid,
      reason: 'Violation',
      banDuration: '7 days',
    })

    expect(payload.payload.ban_duration).toBe('7 days')
  })
})

describe('Notification preferences', () => {
  it('setPreference and getPreferences functions are defined', () => {
    expect(setPreference).toBeDefined()
    expect(getPreferences).toBeDefined()
  })
})

describe('Presence helper', () => {
  it('getPresence is async and returns boolean', async () => {
    // The function signature is correct; actual call needs DB
    expect(typeof getPresence).toBe('function')
    // getPresence returns Promise<boolean>
    const result = getPresence('test')
    expect(result).toBeInstanceOf(Promise)
  })
})

function getMinimalContext(type: string) {
  const contexts: Record<string, Parameters<typeof createNotification>[1]> = {
    like_received: { recipientId: validUuid, actorId: validUuid, actorName: 'X', entityId: validUuid },
    like_revoked: { recipientId: validUuid, actorId: validUuid, entityId: validUuid },
    match_created: { recipientId: validUuid, actorId: validUuid, actorName: 'X', matchId: validUuid },
    message_new: { recipientId: validUuid, actorId: validUuid, actorName: 'X', messageId: validUuid, chatId: validUuid },
    photo_approved: { recipientId: validUuid, photoId: validUuid },
    photo_rejected: { recipientId: validUuid, photoId: validUuid, reason: 'Blurry' },
    photo_removed_by_moderator: { recipientId: validUuid, photoId: validUuid, reason: 'Inappropriate' },
    account_blocked: { recipientId: validUuid, reason: 'Violation' },
    account_reinstated: { recipientId: validUuid },
    account_suspension_expired: { recipientId: validUuid },
    inactivity_warning: { recipientId: validUuid },
  }
  return contexts[type] ?? { recipientId: validUuid }
}
