import { describe, it, expect, vi } from 'vitest'
import { AppError } from '@/lib/errors/app-error'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['mock-event-id'] }) },
}))

type RpcResult = { data: unknown; error?: unknown }

/**
 * Helpers for the supabase client surface used by sendLike (post-RPC refactor).
 *
 * sendLike now hits exactly two endpoints:
 *   1. checkLikeLimits → rpc('has_active_subscription'), `from('profiles').select('gender').eq().single()`,
 *      optionally rpc('count_likes_used').
 *   2. send-like body → rpc('send_like').single<SendLikeRpcRow>().
 *
 * Notification fan-out fires `from('notifications').insert([...])` on match.
 */
function buildAdminMock({
  hasSubscription = false,
  likesUsed = 0,
  senderGender = 'male',
  rpcSendLike,
  notifInsert,
}: {
  hasSubscription?: boolean
  likesUsed?: number
  senderGender?: 'male' | 'female'
  rpcSendLike: RpcResult
  notifInsert?: ReturnType<typeof vi.fn>
}) {
  const single = vi.fn().mockResolvedValue({ data: { gender: senderGender }, error: null })

  const rpc = vi.fn((fn: string) => {
    if (fn === 'has_active_subscription') {
      return Promise.resolve({ data: hasSubscription, error: null })
    }
    if (fn === 'count_likes_used') {
      return Promise.resolve({ data: likesUsed, error: null })
    }
    if (fn === 'send_like') {
      // .single() chains off rpc — return a thenable that supports .single()
      return {
        single: vi.fn().mockResolvedValue(rpcSendLike),
      }
    }
    return Promise.resolve({ data: null, error: null })
  })

  const fromImpl = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single }),
        }),
      }
    }
    if (table === 'notifications') {
      return { insert: notifInsert ?? vi.fn().mockReturnValue({ error: null }) }
    }
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }) }
  })

  return { rpc, from: fromImpl }
}

describe('sendLike (RPC-backed)', () => {
  it('returns matched=false when send_like reports no mutual', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')

    ;(createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      buildAdminMock({
        rpcSendLike: { data: { matched: false, match_id: null, error_code: null } },
      }),
    )

    const { sendLike } = await import('@/features/likes/server/send-like')
    const result = await sendLike({ fromUserId: 'user-a', toUserId: 'user-b' })
    expect(result.matched).toBe(false)
    expect(result.match_id).toBeUndefined()
  })

  it('returns matched=true and inserts notifications when mutual', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')

    const notifInsert = vi.fn().mockReturnValue({ error: null })
    ;(createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      buildAdminMock({
        senderGender: 'female',
        rpcSendLike: {
          data: { matched: true, match_id: 'match-1', error_code: null },
        },
        notifInsert,
      }),
    )

    const { sendLike } = await import('@/features/likes/server/send-like')
    const result = await sendLike({ fromUserId: 'user-b', toUserId: 'user-a' })
    expect(result.matched).toBe(true)
    expect(result.match_id).toBe('match-1')
    expect(notifInsert).toHaveBeenCalledTimes(1)
  })

  it('translates RPC error_code into AppError', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')

    ;(createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      buildAdminMock({
        rpcSendLike: {
          data: { matched: false, match_id: null, error_code: 'LIKE_ALREADY_SENT' },
        },
      }),
    )

    const { sendLike } = await import('@/features/likes/server/send-like')
    await expect(
      sendLike({ fromUserId: 'user-a', toUserId: 'user-b' }),
    ).rejects.toThrow(AppError)
  })

  it('rejects with LIKE_LIMIT_REACHED when free-tier male exceeds quota', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')

    ;(createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      buildAdminMock({
        senderGender: 'male',
        likesUsed: 3,
        rpcSendLike: { data: null, error: null }, // never reached
      }),
    )

    const { sendLike } = await import('@/features/likes/server/send-like')
    await expect(
      sendLike({ fromUserId: 'user-a', toUserId: 'user-b' }),
    ).rejects.toThrow(AppError)
  })
})

describe('revokeLike - cleanup', () => {
  function makeMaybeSingleChain(responses: Array<{ data: unknown; error?: unknown }>) {
    let idx = 0
    return vi.fn(() => {
      const resp = responses[idx] ?? { data: null }
      idx++
      return Promise.resolve({ data: resp.data, error: resp.error ?? null })
    })
  }

  it('should find and delete like', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')

    const maybeSingle = makeMaybeSingleChain([
      { data: { id: 'like-1' } },
      { data: null },
    ])
    const deleteFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    ;(createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
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

    ;(createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
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
