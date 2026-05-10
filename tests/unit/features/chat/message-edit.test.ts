import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '@/lib/errors/app-error'

function now() {
  return new Date().toISOString()
}

function fiveMinutesAgo() {
  return new Date(Date.now() - 6 * 60 * 1000).toISOString()
}

/**
 * Simple mock factory: returns a Supabase-like client where
 * .single() returns pre-configured responses in sequence.
 */
function makeMock(
  responses: Array<{ data: Record<string, unknown> | null; error: Record<string, unknown> | null }>,
) {
  let callIdx = 0
  const eqSingle = vi.fn().mockImplementation(() => {
    const resp = responses[callIdx] ?? { data: null, error: { message: 'no mock data' } }
    callIdx++
    return Promise.resolve(resp)
  })

  const eqFn = vi.fn().mockReturnValue({ single: eqSingle })
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

  // For update chain: update().eq().select().single()
  const updateSingle = eqSingle
  const updateSelect = vi.fn().mockReturnValue({ single: updateSingle })
  const updateEq = vi.fn().mockReturnValue({ select: updateSelect, single: updateSingle })
  const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

  const fromFn = vi.fn().mockImplementation((table: string) => {
    if (table === 'messages') {
      return { select: selectFn, update: updateFn }
    }
    return { select: selectFn, update: updateFn }
  })

  return { from: fromFn }
}

const mockModule = {
  createAdminClient: () =>
    ({}) as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
}

vi.mock('@/lib/supabase/admin', () => mockModule)

const { editMessage } = await import('@/features/chat/server/edit-message')
const { deleteMessage } = await import('@/features/chat/server/delete-message')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('editMessage', () => {
  it('edits own text message within 5-minute window', async () => {
    mockModule.createAdminClient = () =>
      makeMock([
        {
          data: {
            id: 'msg-1',
            sender_id: 'user-1',
            type: 'text',
            content: 'original',
            created_at: now(),
            deleted_at: null,
          },
          error: null,
        },
        {
          data: { id: 'msg-1', content: 'edited', edited_at: now(), original_content: 'original' },
          error: null,
        },
      ]) as never

    const result = await editMessage({ messageId: 'msg-1', content: 'edited', userId: 'user-1' })
    expect(result).toBeDefined()
    expect(result.content).toBe('edited')
  })

  it('rejects message not found', async () => {
    mockModule.createAdminClient = () =>
      makeMock([{ data: null, error: { message: 'not found' } }]) as never

    await expect(
      editMessage({ messageId: 'msg-404', content: 'test', userId: 'user-1' }),
    ).rejects.toThrow(AppError)
  })

  it('rejects if not the message owner', async () => {
    mockModule.createAdminClient = () =>
      makeMock([
        {
          data: {
            id: 'msg-2',
            sender_id: 'user-2',
            type: 'text',
            content: 'original',
            created_at: now(),
            deleted_at: null,
          },
          error: null,
        },
      ]) as never

    try {
      await editMessage({ messageId: 'msg-2', content: 'hacked', userId: 'user-1' })
      expect.fail('Expected error')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('MESSAGE_NOT_OWNER')
    }
  })

  it('rejects if message is not text type', async () => {
    mockModule.createAdminClient = () =>
      makeMock([
        {
          data: {
            id: 'msg-3',
            sender_id: 'user-1',
            type: 'image',
            content: 'photo.jpg',
            created_at: now(),
            deleted_at: null,
          },
          error: null,
        },
      ]) as never

    try {
      await editMessage({ messageId: 'msg-3', content: 'edited', userId: 'user-1' })
      expect.fail('Expected error')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('MESSAGE_NOT_TEXT')
    }
  })

  it('rejects if edit window expired', async () => {
    mockModule.createAdminClient = () =>
      makeMock([
        {
          data: {
            id: 'msg-4',
            sender_id: 'user-1',
            type: 'text',
            content: 'old',
            created_at: fiveMinutesAgo(),
            deleted_at: null,
          },
          error: null,
        },
      ]) as never

    try {
      await editMessage({ messageId: 'msg-4', content: 'late edit', userId: 'user-1' })
      expect.fail('Expected error')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('MESSAGE_EDIT_WINDOW_EXPIRED')
    }
  })

  it('rejects if message already deleted', async () => {
    mockModule.createAdminClient = () =>
      makeMock([
        {
          data: {
            id: 'msg-5',
            sender_id: 'user-1',
            type: 'text',
            content: 'deleted',
            created_at: now(),
            deleted_at: now(),
          },
          error: null,
        },
      ]) as never

    try {
      await editMessage({ messageId: 'msg-5', content: 'edit', userId: 'user-1' })
      expect.fail('Expected error')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('MESSAGE_ALREADY_DELETED')
    }
  })
})

describe('deleteMessage', () => {
  it('deletes own message', async () => {
    mockModule.createAdminClient = () =>
      makeMock([
        {
          data: {
            id: 'msg-6',
            sender_id: 'user-1',
            type: 'text',
            content: 'to delete',
            deleted_at: null,
          },
          error: null,
        },
        {
          data: { id: 'msg-6' },
          error: null,
        },
      ]) as never

    await expect(deleteMessage({ messageId: 'msg-6', userId: 'user-1' })).resolves.toBeUndefined()
  })

  it('rejects if not the message owner', async () => {
    mockModule.createAdminClient = () =>
      makeMock([
        {
          data: {
            id: 'msg-7',
            sender_id: 'user-2',
            type: 'text',
            content: 'not yours',
            deleted_at: null,
          },
          error: null,
        },
      ]) as never

    try {
      await deleteMessage({ messageId: 'msg-7', userId: 'user-1' })
      expect.fail('Expected error')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('MESSAGE_NOT_OWNER')
    }
  })

  it('rejects if already deleted', async () => {
    mockModule.createAdminClient = () =>
      makeMock([
        {
          data: { id: 'msg-8', sender_id: 'user-1', type: 'text', content: '', deleted_at: now() },
          error: null,
        },
      ]) as never

    try {
      await deleteMessage({ messageId: 'msg-8', userId: 'user-1' })
      expect.fail('Expected error')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('MESSAGE_ALREADY_DELETED')
    }
  })
})
