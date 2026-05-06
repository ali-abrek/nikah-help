import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { AUTH_STRICT } from '@/lib/ratelimit/presets'

function mockHandler() {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('withRateLimit', () => {
  it('should bypass rate limit for admin role', async () => {
    const handler = mockHandler()
    const wrapped = withRateLimit(handler, AUTH_STRICT)
    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-user-role': 'admin' },
    })
    await wrapped(req, {})
    expect(handler).toHaveBeenCalled()
  })

  it('should bypass rate limit for moderator role', async () => {
    const handler = mockHandler()
    const wrapped = withRateLimit(handler, AUTH_STRICT)
    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-user-role': 'moderator' },
    })
    await wrapped(req, {})
    expect(handler).toHaveBeenCalled()
  })

  it('should call handler when Redis is unavailable (fail-open)', async () => {
    const handler = mockHandler()
    const wrapped = withRateLimit(handler, {
      limit: 10,
      window: 60,
      keyStrategy: 'ip',
    })
    const req = new NextRequest('http://localhost/api/test')
    // When UPSTASH env vars are empty, the Redis call fails — handler still runs
    await wrapped(req, {})
    expect(handler).toHaveBeenCalled()
  })
})
