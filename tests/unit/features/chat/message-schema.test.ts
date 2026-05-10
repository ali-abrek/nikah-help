import { describe, it, expect } from 'vitest'
import {
  sendMessageSchema,
  editMessageSchema,
  deleteMessageSchema,
  markDeliveredSchema,
  markAsReadSchema,
  deleteChatSchema,
} from '@/features/chat/schemas'

// Valid UUID v4 with correct version (4) and variant (8) nibbles
const validUuid = '00000000-0000-4000-8000-000000000001'
const validUuid2 = '00000000-0000-4000-8000-000000000002'

describe('sendMessageSchema', () => {
  it('accepts valid text message', () => {
    const result = sendMessageSchema.safeParse({
      chat_id: validUuid,
      type: 'text',
      content: 'Hello!',
    })
    expect(result.success).toBe(true)
  })

  it('accepts image message', () => {
    const result = sendMessageSchema.safeParse({
      chat_id: validUuid,
      type: 'image',
      content: 'https://example.com/photo.jpg',
    })
    expect(result.success).toBe(true)
  })

  it('accepts voice message', () => {
    const result = sendMessageSchema.safeParse({
      chat_id: validUuid,
      type: 'voice',
      content: 'chat-media/voice-123.webm',
    })
    expect(result.success).toBe(true)
  })

  it('accepts optional parent_id', () => {
    const result = sendMessageSchema.safeParse({
      chat_id: validUuid,
      type: 'text',
      content: 'Reply!',
      parent_id: validUuid2,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty content', () => {
    const result = sendMessageSchema.safeParse({
      chat_id: validUuid,
      type: 'text',
      content: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects content over 4000 chars', () => {
    const result = sendMessageSchema.safeParse({
      chat_id: validUuid,
      type: 'text',
      content: 'x'.repeat(4001),
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid type', () => {
    const result = sendMessageSchema.safeParse({
      chat_id: validUuid,
      type: 'file',
      content: 'test',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid chat_id', () => {
    const result = sendMessageSchema.safeParse({
      chat_id: 'not-a-uuid',
      type: 'text',
      content: 'test',
    })
    expect(result.success).toBe(false)
  })
})

describe('editMessageSchema', () => {
  it('accepts valid edit', () => {
    const result = editMessageSchema.safeParse({
      message_id: validUuid,
      content: 'Edited message',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty content', () => {
    const result = editMessageSchema.safeParse({
      message_id: validUuid,
      content: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('deleteMessageSchema', () => {
  it('accepts valid message_id', () => {
    const result = deleteMessageSchema.safeParse({
      message_id: validUuid,
    })
    expect(result.success).toBe(true)
  })
})

describe('markDeliveredSchema', () => {
  it('accepts valid message_ids array', () => {
    const result = markDeliveredSchema.safeParse({
      message_ids: [validUuid],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty array', () => {
    const result = markDeliveredSchema.safeParse({
      message_ids: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than 100 ids', () => {
    const result = markDeliveredSchema.safeParse({
      message_ids: Array.from({ length: 101 }, () => validUuid),
    })
    expect(result.success).toBe(false)
  })
})

describe('markAsReadSchema', () => {
  it('accepts valid input', () => {
    const result = markAsReadSchema.safeParse({
      chat_id: validUuid,
      message_ids: [validUuid2],
    })
    expect(result.success).toBe(true)
  })
})

describe('deleteChatSchema', () => {
  it('accepts valid chat_id', () => {
    const result = deleteChatSchema.safeParse({ chat_id: validUuid })
    expect(result.success).toBe(true)
  })

  it('rejects invalid chat_id', () => {
    const result = deleteChatSchema.safeParse({ chat_id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })
})
