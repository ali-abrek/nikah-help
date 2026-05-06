import { describe, it, expect } from 'vitest'
import { AppError } from '@/lib/errors/app-error'

describe('AppError', () => {
  it('should create error with correct status and traceId', () => {
    const err = new AppError('AUTH_UNAUTHORIZED')
    expect(err.code).toBe('AUTH_UNAUTHORIZED')
    expect(err.status).toBe(401)
    expect(err.traceId).toBeDefined()
    expect(err.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('should use provided message instead of code', () => {
    const err = new AppError('LIKE_LIMIT_REACHED', {
      message: 'Custom message',
    })
    expect(err.message).toBe('Custom message')
  })

  it('should serialize to ErrorResponse without internal data', () => {
    const err = new AppError('LIKE_LIMIT_REACHED', {
      logContext: { userId: 'abc', likesUsed: 3 },
      cause: new Error('DB timeout'),
    })
    const res = err.toResponse()
    expect(res.code).toBe('LIKE_LIMIT_REACHED')
    expect(res.status).toBe(409)
    expect(res.trace_id).toBe(err.traceId)
    expect(res).not.toHaveProperty('logContext')
    expect(res).not.toHaveProperty('cause')
  })

  it('should include details when provided', () => {
    const err = new AppError('VALIDATION_INVALID_INPUT', {
      details: { email: 'Некорректный email' },
    })
    const res = err.toResponse()
    expect(res.details).toEqual({ email: 'Некорректный email' })
  })
})
