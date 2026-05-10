import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { assertCronAuth } from '@/lib/api/cron'
import { AppError } from '@/lib/errors/app-error'

const SECRET = 'test-cron-secret-1234567890abcdef'
let originalSecret: string | undefined

beforeEach(() => {
  originalSecret = process.env.VERCEL_CRON_SECRET
  process.env.VERCEL_CRON_SECRET = SECRET
})

afterEach(() => {
  process.env.VERCEL_CRON_SECRET = originalSecret
})

function reqWith(authHeader: string | null): NextRequest {
  const headers = new Headers()
  if (authHeader !== null) headers.set('authorization', authHeader)
  return new NextRequest('http://localhost/api/cron/expire-suspensions', {
    method: 'GET',
    headers,
  })
}

describe('assertCronAuth', () => {
  it('accepts the correct Bearer header', () => {
    expect(() => assertCronAuth(reqWith(`Bearer ${SECRET}`))).not.toThrow()
  })

  it('rejects when the header is missing', () => {
    expect(() => assertCronAuth(reqWith(null))).toThrow(AppError)
  })

  it('rejects when the prefix is wrong', () => {
    expect(() => assertCronAuth(reqWith(`Token ${SECRET}`))).toThrow(AppError)
  })

  it('rejects when the secret is wrong', () => {
    expect(() => assertCronAuth(reqWith('Bearer wrong-secret'))).toThrow(AppError)
  })

  it('rejects when the secret length is shorter than expected', () => {
    expect(() => assertCronAuth(reqWith('Bearer short'))).toThrow(AppError)
  })

  it('rejects when the secret length is longer than expected', () => {
    expect(() => assertCronAuth(reqWith(`Bearer ${SECRET}-extra-bytes`))).toThrow(AppError)
  })

  it('uses constant-time comparison (smoke test only)', () => {
    // We can't easily measure timing in JS, but we sanity-check that two
    // values differing only in the last byte still throw without leaking
    // partial-prefix matches.
    const almost = SECRET.slice(0, -1) + 'X'
    expect(() => assertCronAuth(reqWith(`Bearer ${almost}`))).toThrow(AppError)
  })
})
