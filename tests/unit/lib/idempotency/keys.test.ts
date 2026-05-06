import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { resolveIdempotencyKey } from '@/lib/idempotency/keys'

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('resolveIdempotencyKey', () => {
  it('should resolve key for authenticated user', async () => {
    const req = new NextRequest('http://localhost/api/payments/init', {
      headers: { 'x-user-id': 'user-abc' },
    })
    const key = await resolveIdempotencyKey(req, VALID_UUID)
    expect(key).toContain('idempotency:user:user-abc:')
    expect(key).toContain(VALID_UUID)
  })

  it('should fall back to IP for unauthenticated request', async () => {
    const req = new NextRequest('http://localhost/api/payments/init', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    })
    const key = await resolveIdempotencyKey(req, VALID_UUID)
    expect(key).toContain('idempotency:ip:')
    expect(key).toContain(VALID_UUID)
  })

  it('should reject invalid UUID', async () => {
    const req = new NextRequest('http://localhost/api/payments/init')
    await expect(resolveIdempotencyKey(req, 'not-a-uuid')).rejects.toThrow()
  })

  it('should reject empty string', async () => {
    const req = new NextRequest('http://localhost/api/payments/init')
    await expect(resolveIdempotencyKey(req, '')).rejects.toThrow()
  })

  it('should accept valid UUID v4', async () => {
    const req = new NextRequest('http://localhost/api/payments/init', {
      headers: { 'x-user-id': 'user-1' },
    })
    const key = await resolveIdempotencyKey(req, VALID_UUID)
    expect(key).toBe(`idempotency:user:user-1:${VALID_UUID}`)
  })
})
