import { describe, it, expect } from 'vitest'
import { NextResponse } from 'next/server'
import { setRateLimitHeaders } from '@/lib/ratelimit/headers'

describe('setRateLimitHeaders', () => {
  it('should set X-RateLimit-* headers on response', () => {
    const res = NextResponse.json({ ok: true })
    setRateLimitHeaders(res, 30, 29, 1700000000000)
    expect(res.headers.get('X-RateLimit-Limit')).toBe('30')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('29')
    expect(res.headers.get('X-RateLimit-Reset')).toBe('1700000000000')
  })
})
