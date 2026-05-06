import { describe, it, expect } from 'vitest'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'

describe('handleRouteError', () => {
  it('should return ErrorResponse for AppError', async () => {
    const err = new AppError('AUTH_UNAUTHORIZED')
    const res = handleRouteError(err)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('AUTH_UNAUTHORIZED')
    expect(body.trace_id).toBeDefined()
  })

  it('should wrap unknown errors as SYSTEM_INTERNAL_ERROR', async () => {
    const res = handleRouteError(new Error('boom'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('SYSTEM_INTERNAL_ERROR')
  })

  it('should wrap non-Error values as SYSTEM_INTERNAL_ERROR', async () => {
    const res = handleRouteError('string error')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('SYSTEM_INTERNAL_ERROR')
  })
})
