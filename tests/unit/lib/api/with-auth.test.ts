import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'

const getClaimsMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: async () => ({
    auth: { getClaims: getClaimsMock },
  }),
}))

beforeEach(() => {
  getClaimsMock.mockReset()
})

describe('withAuth', () => {
  it('rejects with 401 when getClaims returns no session', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: null })
    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const wrapped = withAuth(handler)

    const req = new NextRequest('http://localhost/api/photos/process', {
      method: 'POST',
    })
    const res = await wrapped(req, undefined)

    expect(handler).not.toHaveBeenCalled()
    expect(res.status).toBe(401)
  })

  it('rejects with 401 when getClaims errors', async () => {
    getClaimsMock.mockResolvedValue({
      data: null,
      error: new Error('jwt expired'),
    })
    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const wrapped = withAuth(handler)

    const req = new NextRequest('http://localhost/api/photos/process', {
      method: 'POST',
    })
    const res = await wrapped(req, undefined)

    expect(handler).not.toHaveBeenCalled()
    expect(res.status).toBe(401)
  })

  it('overwrites a spoofed x-user-id with the verified subject', async () => {
    const verifiedId = 'aaaaaaaa-1111-4111-8111-111111111111'
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: verifiedId, role: 'user' } },
      error: null,
    })

    const handler = vi.fn(async (req: NextRequest) => {
      // Trusted: should be the verified id, NOT the spoofed one.
      return NextResponse.json({
        seen: req.headers.get('x-user-id'),
        role: req.headers.get('x-user-role'),
      })
    })
    const wrapped = withAuth(handler)

    const req = new NextRequest('http://localhost/api/photos/process', {
      method: 'POST',
      headers: {
        'x-user-id': 'attacker-spoofed-id',
        'x-user-role': 'admin',
      },
    })
    const res = await wrapped(req, undefined)

    expect(handler).toHaveBeenCalledOnce()
    const body = (await res.json()) as { seen: string; role: string }
    expect(body.seen).toBe(verifiedId)
    expect(body.role).toBe('user')
  })

  it('defaults role to "user" when claim is absent', async () => {
    const verifiedId = 'bbbbbbbb-2222-4222-8222-222222222222'
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: verifiedId } },
      error: null,
    })

    const handler = vi.fn(async (req: NextRequest) =>
      NextResponse.json({ role: req.headers.get('x-user-role') }),
    )
    const wrapped = withAuth(handler)

    const req = new NextRequest('http://localhost/api/feed', { method: 'GET' })
    const res = await wrapped(req, undefined)
    const body = (await res.json()) as { role: string }
    expect(body.role).toBe('user')
  })

  it('rejects when sub claim is missing or non-string', async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { role: 'user' } },
      error: null,
    })
    const handler = vi.fn()
    const wrapped = withAuth(handler)

    const req = new NextRequest('http://localhost/api/feed', { method: 'GET' })
    const res = await wrapped(req, undefined)
    expect(handler).not.toHaveBeenCalled()
    expect(res.status).toBe(401)
  })

  it('forwards the route context untouched to the handler', async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: 'cccccccc-3333-4333-8333-333333333333', role: 'user' } },
      error: null,
    })

    type Ctx = { params: Promise<{ messageId: string }> }
    const handler = vi.fn(async (_req: NextRequest, ctx: Ctx) => {
      const { messageId } = await ctx.params
      return NextResponse.json({ messageId })
    })
    const wrapped = withAuth<Ctx>(handler)

    const req = new NextRequest('http://localhost/api/chats/messages/abc', {
      method: 'PATCH',
    })
    const res = await wrapped(req, {
      params: Promise.resolve({ messageId: 'abc' }),
    })
    const body = (await res.json()) as { messageId: string }
    expect(body.messageId).toBe('abc')
  })
})
