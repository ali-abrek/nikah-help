import { describe, it, expect, vi } from 'vitest'
import { AppError } from '@/lib/errors/app-error'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['mock-event-id'] }) },
}))

function makeRpc(overrides: Record<string, unknown> = {}) {
  return vi.fn((fn: string) => {
    if (fn in overrides) return Promise.resolve({ data: overrides[fn], error: null })
    return Promise.resolve({ data: null, error: null })
  })
}

function makeSingleChain(responses: Array<{ data: unknown; error?: unknown }>) {
  let idx = 0
  return vi.fn(() => {
    const resp = responses[idx] ?? { data: null }
    idx++
    return Promise.resolve({ data: resp.data, error: resp.error ?? null })
  })
}

function makeMaybeSingleChain(responses: Array<{ data: unknown; error?: unknown }>) {
  let idx = 0
  return vi.fn(() => {
    const resp = responses[idx] ?? { data: null }
    idx++
    return Promise.resolve({ data: resp.data, error: resp.error ?? null })
  })
}

describe('sendLike - match trigger', () => {
  it('should create like and detect no match on first like', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')

    // single is called 3 times: checkLikeLimits(sender gender), target profile, sender profile
    const single = makeSingleChain([
      { data: { gender: 'male' } }, // checkLikeLimits: sender gender = male
      { data: { gender: 'female', is_published: true, id: 'user-b' } }, // sendLike: target
      { data: { gender: 'male' } }, // sendLike: sender
    ])
    const maybeSingle = makeMaybeSingleChain([
      { data: null }, // no existing like
      { data: null }, // no match
    ])
    const insert = vi.fn().mockReturnValue({ error: null })

    // eslint-disable-next-line
    ;(createAdminClient as any).mockReturnValue({
      rpc: makeRpc({
        has_active_subscription: false,
        count_likes_used: 0,
        is_blocked_pair: false,
      }),
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single }),
            }),
          }
        }
        if (table === 'likes') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ maybeSingle }),
              }),
            }),
            insert,
          }
        }
        if (table === 'matches') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({ maybeSingle }),
              }),
            }),
          }
        }
        if (table === 'notifications') {
          return { insert: vi.fn().mockReturnValue({ error: null }) }
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }) }
      }),
    })

    const { sendLike } = await import('@/features/likes/server/send-like')
    const result = await sendLike({ fromUserId: 'user-a', toUserId: 'user-b' })
    expect(result.matched).toBe(false)
    expect(insert).toHaveBeenCalledWith({
      from_user_id: 'user-a',
      to_user_id: 'user-b',
    })
  })

  it('should detect match when mutual like exists', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')

    // single is called 3 times: checkLikeLimits(sender gender), target profile, sender profile
    const single = makeSingleChain([
      { data: { gender: 'female' } }, // checkLikeLimits: sender gender = female (unlimited)
      { data: { gender: 'male', is_published: true, id: 'user-a' } }, // sendLike: target
      { data: { gender: 'female' } }, // sendLike: sender
    ])
    const maybeSingle = makeMaybeSingleChain([
      { data: null }, // no existing like
      { data: { id: 'match-1' } }, // match found!
    ])
    const insert = vi.fn().mockReturnValue({ error: null })
    const notifInsert = vi.fn().mockReturnValue({ error: null })

    ;(createAdminClient as any).mockReturnValue({
      rpc: makeRpc({
        has_active_subscription: false,
        count_likes_used: 0,
        is_blocked_pair: false,
      }),
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single }),
            }),
          }
        }
        if (table === 'likes') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ maybeSingle }),
              }),
            }),
            insert,
          }
        }
        if (table === 'matches') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({ maybeSingle }),
              }),
            }),
          }
        }
        if (table === 'notifications') {
          return { insert: notifInsert }
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }) }
      }),
    })

    const { sendLike } = await import('@/features/likes/server/send-like')
    const result = await sendLike({ fromUserId: 'user-b', toUserId: 'user-a' })
    expect(result.matched).toBe(true)
    expect(notifInsert).toHaveBeenCalled()
  })

  it('should reject like on own profile', async () => {
    const { sendLike } = await import('@/features/likes/server/send-like')
    await expect(
      sendLike({ fromUserId: 'user-a', toUserId: 'user-a' }),
    ).rejects.toThrow(AppError)
  })

  it('should reject like when already liked', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')

    // single is called 2 times: checkLikeLimits(sender gender), target profile
    // (doesn't get to sender profile because LIKE_ALREADY_SENT is thrown first)
    const single = makeSingleChain([
      { data: { gender: 'male' } }, // checkLikeLimits: sender gender = male
      { data: { gender: 'female', is_published: true, id: 'user-b' } }, // sendLike: target
    ])
    const maybeSingle = makeMaybeSingleChain([
      { data: { id: 'existing-like' } }, // already liked!
    ])

    ;(createAdminClient as any).mockReturnValue({
      rpc: makeRpc({
        has_active_subscription: false,
        count_likes_used: 0,
        is_blocked_pair: false,
      }),
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single }),
            }),
          }
        }
        if (table === 'likes') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ maybeSingle }),
              }),
            }),
          }
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }) }
      }),
    })

    const { sendLike } = await import('@/features/likes/server/send-like')
    await expect(
      sendLike({ fromUserId: 'user-a', toUserId: 'user-b' }),
    ).rejects.toThrow(AppError)
  })
})

describe('revokeLike - cleanup', () => {
  it('should find and delete like', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')

    const maybeSingle = makeMaybeSingleChain([
      { data: { id: 'like-1' } }, // like found
      { data: null }, // no match
    ])
    const deleteFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    ;(createAdminClient as any).mockReturnValue({
      rpc: vi.fn(),
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'likes') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ maybeSingle }),
              }),
            }),
            delete: deleteFn,
          }
        }
        if (table === 'matches') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({ maybeSingle }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle }),
          }),
        }
      }),
    })

    const { revokeLike } = await import('@/features/likes/server/revoke-like')
    await revokeLike({ fromUserId: 'user-a', toUserId: 'user-b' })
    expect(deleteFn).toHaveBeenCalled()
  })

  it('should throw NOT_FOUND when like does not exist', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')

    const maybeSingle = vi.fn().mockResolvedValue({ data: null })

    ;(createAdminClient as any).mockReturnValue({
      rpc: vi.fn(),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle }),
          }),
        }),
      }),
    })

    const { revokeLike } = await import('@/features/likes/server/revoke-like')
    await expect(
      revokeLike({ fromUserId: 'user-a', toUserId: 'user-b' }),
    ).rejects.toThrow(AppError)
  })
})
