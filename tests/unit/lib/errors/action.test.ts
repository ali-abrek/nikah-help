import { describe, it, expect } from 'vitest'
import { handleActionError } from '@/lib/errors/action'
import { AppError } from '@/lib/errors/app-error'

describe('handleActionError', () => {
  it('should return error shape for AppError', () => {
    const err = new AppError('AUTH_UNAUTHORIZED')
    const result = handleActionError(err)
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('AUTH_UNAUTHORIZED')
    expect(result.error.status).toBe(401)
    expect(result.error.trace_id).toBeDefined()
  })

  it('should wrap unknown errors as SYSTEM_INTERNAL_ERROR', () => {
    const result = handleActionError(new Error('boom'))
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('SYSTEM_INTERNAL_ERROR')
    expect(result.error.status).toBe(500)
  })
})
