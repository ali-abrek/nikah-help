import { describe, it, expect } from 'vitest'
import type { NotificationType } from '@/lib/notifications/types'
import { resolveTemplate } from '@/lib/notifications/templates'
import { resolveLink } from '@/lib/notifications/links'
import { validateContext } from '@/lib/notifications/validation'
import { createNotification } from '@/lib/notifications/factory'

const ALL_TYPES: NotificationType[] = [
  'like_received',
  'like_revoked',
  'match_created',
  'message_new',
  'photo_approved',
  'photo_rejected',
  'photo_removed_by_moderator',
  'account_blocked',
  'account_reinstated',
  'account_suspension_expired',
  'inactivity_warning',
]

describe('Template completeness', () => {
  it('every NotificationType has a template defined', () => {
    for (const type of ALL_TYPES) {
      const template = resolveTemplate(type)
      expect(template).toBeDefined()
      expect(template.titleKey).toMatch(/^notifications\.\w+\.title$/)
      expect(template.bodyKey).toMatch(/^notifications\.\w+\.body$/)
    }
  })

  it('template keys match the notification type', () => {
    for (const type of ALL_TYPES) {
      const template = resolveTemplate(type)
      expect(template.titleKey).toBe(`notifications.${type}.title`)
      expect(template.bodyKey).toBe(`notifications.${type}.body`)
    }
  })

  it('throws for unknown notification type', () => {
    expect(() => resolveTemplate('unknown_type' as NotificationType)).toThrow()
  })
})

describe('Link resolution', () => {
  it('returns profile link for like_received', () => {
    const link = resolveLink('like_received', { recipientId: 'u1', actorId: 'a1' })
    expect(link).toBe('/profiles/a1')
  })

  it('returns undefined when actorId missing for like_received', () => {
    const link = resolveLink('like_received', { recipientId: 'u1' })
    expect(link).toBeUndefined()
  })

  it('returns match link for match_created', () => {
    const link = resolveLink('match_created', { recipientId: 'u1', matchId: 'm1' })
    expect(link).toBe('/matches/m1')
  })

  it('returns chat link for message_new', () => {
    const link = resolveLink('message_new', { recipientId: 'u1', chatId: 'c1' })
    expect(link).toBe('/chat/c1')
  })

  it('returns undefined for like_revoked', () => {
    const link = resolveLink('like_revoked', { recipientId: 'u1' })
    expect(link).toBeUndefined()
  })

  it('returns settings/photos for photo_approved', () => {
    const link = resolveLink('photo_approved', { recipientId: 'u1' })
    expect(link).toBe('/settings/photos')
  })

  it('returns /feed for account_reinstated', () => {
    const link = resolveLink('account_reinstated', { recipientId: 'u1' })
    expect(link).toBe('/feed')
  })

  it('returns undefined for unknown type', () => {
    const link = resolveLink('unknown_type' as NotificationType, { recipientId: 'u1' })
    expect(link).toBeUndefined()
  })
})

describe('Context validation', () => {
  const validUuid = '00000000-0000-4000-8000-000000000001'

  it('passes validation for like_received with all required fields', () => {
    expect(() =>
      validateContext('like_received', {
        recipientId: validUuid,
        actorId: validUuid,
        actorName: 'Alice',
        entityId: validUuid,
      }),
    ).not.toThrow()
  })

  it('throws when required field is missing', () => {
    expect(() =>
      validateContext('like_received', {
        recipientId: validUuid,
        actorId: validUuid,
        // actorName missing
        entityId: validUuid,
      }),
    ).toThrow(/Missing required context fields/)
  })

  it('passes for account_reinstated with only recipientId', () => {
    expect(() =>
      validateContext('account_reinstated', { recipientId: validUuid }),
    ).not.toThrow()
  })

  it('throws for photo_rejected without reason', () => {
    expect(() =>
      validateContext('photo_rejected', {
        recipientId: validUuid,
        photoId: validUuid,
      }),
    ).toThrow(/Missing required context fields/)
  })

  it('passes for message_new with all required fields', () => {
    expect(() =>
      validateContext('message_new', {
        recipientId: validUuid,
        actorId: validUuid,
        actorName: 'Bob',
        messageId: validUuid,
        chatId: validUuid,
      }),
    ).not.toThrow()
  })
})

describe('Notification factory', () => {
  const validUuid = '00000000-0000-4000-8000-000000000001'

  it('creates a valid notification payload for like_received', () => {
    const payload = createNotification('like_received', {
      recipientId: validUuid,
      actorId: validUuid,
      actorName: 'Alice',
      entityId: validUuid,
    })

    expect(payload.title_key).toBe('notifications.like_received.title')
    expect(payload.body_key).toBe('notifications.like_received.body')
    expect(payload.payload.type).toBe('like_received')
    expect(payload.payload.actor_id).toBe(validUuid)
    expect(payload.payload.actor_name).toBe('Alice')
    expect(payload.payload.link).toBe(`/profiles/${validUuid}`)
    expect(payload.payload.timestamp).toBeDefined()
    expect(new Date(payload.payload.timestamp).getTime()).not.toBeNaN()
  })

  it('creates payload for account_blocked with reason', () => {
    const payload = createNotification('account_blocked', {
      recipientId: validUuid,
      reason: 'Violation of terms',
    })

    expect(payload.title_key).toBe('notifications.account_blocked.title')
    expect(payload.body_key).toBe('notifications.account_blocked.body')
    expect(payload.payload.reason).toBe('Violation of terms')
    expect(payload.payload.link).toBeUndefined()
  })

  it('creates payload for inactivity_warning with minimal context', () => {
    const payload = createNotification('inactivity_warning', {
      recipientId: validUuid,
    })

    expect(payload.title_key).toBe('notifications.inactivity_warning.title')
    expect(payload.body_key).toBe('notifications.inactivity_warning.body')
    expect(payload.payload.link).toBe('/feed')
  })

  it('throws when validation fails inside factory', () => {
    expect(() =>
      createNotification('photo_rejected' as NotificationType, {
        recipientId: validUuid,
      }),
    ).toThrow(/Missing required context fields/)
  })

  it('creates payloads for all 11 notification types', () => {
    const minimalContexts: Partial<Record<NotificationType, Parameters<typeof createNotification>[1]>> = {
      like_received: { recipientId: validUuid, actorId: validUuid, actorName: 'X', entityId: validUuid },
      like_revoked: { recipientId: validUuid, actorId: validUuid, entityId: validUuid },
      match_created: { recipientId: validUuid, actorId: validUuid, actorName: 'X', matchId: validUuid },
      message_new: { recipientId: validUuid, actorId: validUuid, actorName: 'X', messageId: validUuid, chatId: validUuid },
      photo_approved: { recipientId: validUuid, photoId: validUuid },
      photo_rejected: { recipientId: validUuid, photoId: validUuid, reason: 'Blurry' },
      photo_removed_by_moderator: { recipientId: validUuid, photoId: validUuid, reason: 'Inappropriate' },
      account_blocked: { recipientId: validUuid, reason: 'Terms violation' },
      account_reinstated: { recipientId: validUuid },
      account_suspension_expired: { recipientId: validUuid },
      inactivity_warning: { recipientId: validUuid },
    }

    for (const type of ALL_TYPES) {
      const ctx = minimalContexts[type]
      expect(ctx, `Missing minimal context for type: ${type}`).toBeDefined()
      const payload = createNotification(type, ctx!)
      expect(payload.title_key).toBe(`notifications.${type}.title`)
      expect(payload.body_key).toBe(`notifications.${type}.body`)
      expect(payload.payload.type).toBe(type)
      expect(payload.payload.timestamp).toBeDefined()
    }
  })
})
