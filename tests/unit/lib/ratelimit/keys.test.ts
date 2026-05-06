import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { resolveKeys } from '@/lib/ratelimit/keys'

describe('resolveKeys', () => {
  it('should resolve IP key for ip strategy', async () => {
    const req = new NextRequest('http://localhost/api/likes/send', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    })
    const keys = await resolveKeys(req, 'ip')
    expect(keys).toHaveLength(1)
    expect(keys[0]).toContain('nikah-help:likes.send:ip:')
  })

  it('should resolve user key from x-user-id header', async () => {
    const req = new NextRequest('http://localhost/api/likes/send', {
      headers: { 'x-user-id': 'user-123' },
    })
    const keys = await resolveKeys(req, 'user')
    expect(keys).toHaveLength(1)
    expect(keys[0]).toContain(':user:user-123')
  })

  it('should resolve both keys for ip+user strategy', async () => {
    const req = new NextRequest('http://localhost/api/likes/send', {
      headers: { 'x-user-id': 'user-123', 'x-forwarded-for': '10.0.0.1' },
    })
    const keys = await resolveKeys(req, 'ip+user')
    expect(keys).toHaveLength(2)
    expect(keys[0]).toContain(':ip:')
    expect(keys[1]).toContain(':user:user-123')
  })

  it('should fall back to IP when user strategy has no user', async () => {
    const req = new NextRequest('http://localhost/api/likes/send')
    const keys = await resolveKeys(req, 'user')
    expect(keys).toHaveLength(1)
    expect(keys[0]).toContain(':ip:')
  })

  it('should normalize UUID segments to :id', async () => {
    const req = new NextRequest(
      'http://localhost/api/photos/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stream',
    )
    const keys = await resolveKeys(req, 'ip')
    expect(keys[0]).toContain(':id')
    expect(keys[0]).not.toContain('a1b2c3d4')
  })
})
