import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { withIdempotency } from '@/lib/idempotency/with-idempotency'
import { PAYMENT_CRITICAL } from '@/lib/idempotency/presets'

function mockHandler(status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('withIdempotency', () => {
  it('should pass through when no key and not required', async () => {
    const handler = mockHandler()
    const wrapped = withIdempotency(handler, { required: false })
    const req = new NextRequest('http://localhost/api/likes/send', {
      method: 'POST',
    })
    const res = await wrapped(req, {})
    expect(handler).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('should reject when key is required but missing', async () => {
    const handler = mockHandler()
    const wrapped = withIdempotency(handler, PAYMENT_CRITICAL)
    const req = new NextRequest('http://localhost/api/payments/init', {
      method: 'POST',
    })
    const res = await wrapped(req, {})
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('IDEMPOTENCY_KEY_MISSING')
  })

  it('should reject invalid UUID format', async () => {
    const handler = mockHandler()
    const wrapped = withIdempotency(handler, { required: true })
    const req = new NextRequest('http://localhost/api/payments/init', {
      method: 'POST',
      headers: { 'idempotency-key': 'not-a-uuid' },
    })
    const res = await wrapped(req, {})
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('IDEMPOTENCY_KEY_INVALID')
  })

  it('should call handler with valid UUID and x-user-id', async () => {
    const handler = mockHandler()
    const wrapped = withIdempotency(handler, { required: true })
    const req = new NextRequest('http://localhost/api/payments/init', {
      method: 'POST',
      headers: {
        'idempotency-key': VALID_UUID,
        'x-user-id': 'user-123',
      },
    })
    // Fails open on Redis unavailability — handler still runs
    const res = await wrapped(req, {})
    expect(handler).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })
})
