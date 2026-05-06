import { describe, it, expect } from 'vitest'
import { parseApiError, getActionError } from '@/lib/errors/client'

describe('parseApiError', () => {
  it('should parse valid error response', async () => {
    const response = new Response(
      JSON.stringify({
        code: 'AUTH_UNAUTHORIZED',
        message: 'Пожалуйста, войдите',
        trace_id: 'abc-123',
        status: 401,
      }),
      { status: 401 },
    )
    const err = await parseApiError(response)
    expect(err.code).toBe('AUTH_UNAUTHORIZED')
    expect(err.status).toBe(401)
  })

  it('should return SYSTEM_INTERNAL_ERROR for non-JSON response', async () => {
    const response = new Response('<html>error</html>', { status: 500 })
    const err = await parseApiError(response)
    expect(err.code).toBe('SYSTEM_INTERNAL_ERROR')
    expect(err.status).toBe(500)
  })

  it('should return SYSTEM_INTERNAL_ERROR for JSON without code', async () => {
    const response = new Response(JSON.stringify({ foo: 'bar' }), { status: 400 })
    const err = await parseApiError(response)
    expect(err.code).toBe('SYSTEM_INTERNAL_ERROR')
  })
})

describe('getActionError', () => {
  it('should extract error from Server Action result', () => {
    const result = {
      success: false as const,
      error: {
        code: 'AUTH_UNAUTHORIZED',
        message: 'Test',
        trace_id: 't',
        status: 401,
      },
    }
    expect(getActionError(result).code).toBe('AUTH_UNAUTHORIZED')
  })
})
