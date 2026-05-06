import { NextRequest, NextResponse } from 'next/server'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'
import { resolveIdempotencyKey } from './keys'
import { acquireLock, storeResult, waitForResult, releaseLock } from './redis'
import type { IdempotencyOptions } from './types'

export function withIdempotency<T>(
  handler: (request: NextRequest, context: T) => Promise<NextResponse>,
  options: IdempotencyOptions = {},
) {
  const ttl = options.ttl ?? 86_400
  const timeout = options.timeout ?? 30_000
  const required = options.required ?? false

  return async (request: NextRequest, context: T): Promise<NextResponse> => {
    const keyHeader = request.headers.get('idempotency-key')

    if (!keyHeader && !required) {
      return handler(request, context)
    }

    try {
      if (!keyHeader && required) {
        throw new AppError('IDEMPOTENCY_KEY_MISSING')
      }

      const redisKey = await resolveIdempotencyKey(request, keyHeader!)

      const acquired = await acquireLock(redisKey, ttl)

      if (acquired) {
        let response: NextResponse
        try {
          response = await handler(request, context)
        } catch (error) {
          await releaseLock(redisKey)
          throw error
        }

        if (response.status >= 200 && response.status < 300) {
          await storeResult(redisKey, response, ttl)
        } else {
          await releaseLock(redisKey)
        }

        return response
      }

      const cached = await waitForResult(redisKey, timeout)

      if (cached) {
        return new NextResponse(cached.body, {
          status: cached.status,
          headers: cached.headers,
        })
      }

      throw new AppError('IDEMPOTENCY_CONFLICT', {
        logContext: { redisKey: redisKey.slice(0, 32) + '...', timeout },
      })
    } catch (error) {
      if (error instanceof AppError) {
        return handleRouteError(error)
      }
      // Redis failure — fail open
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'Idempotency store unavailable, failing open',
        error: (error as Error).message,
      }))
      return handler(request, context)
    }
  }
}
