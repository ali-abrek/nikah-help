import { NextRequest, NextResponse } from 'next/server'
import { getRatelimit } from './client'
import { resolveKeys } from './keys'
import { setRateLimitHeaders } from './headers'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'
import type { RateLimitOptions } from './types'
interface RatelimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

export function withRateLimit<T>(
  handler: (request: NextRequest, context: T) => Promise<NextResponse>,
  options: RateLimitOptions,
) {
  return async (request: NextRequest, context: T): Promise<NextResponse> => {
    try {
      const userRole = request.headers.get('x-user-role')
      const bypassRoles = options.bypassRoles ?? ['admin', 'moderator']
      if (userRole && bypassRoles.includes(userRole)) {
        return handler(request, context)
      }

      const rl = getRatelimit(options.limit, options.window)
      const keys = await resolveKeys(request, options.keyStrategy)

      let mostRestrictive: RatelimitResult | null = null

      for (const key of keys) {
        const result = await rl.limit(key, { rate: 1 })

        if (
          !mostRestrictive ||
          result.remaining < mostRestrictive.remaining
        ) {
          mostRestrictive = result
        }

        if (!result.success) {
          const err = handleRouteError(
            new AppError(
              options.errorCode ?? 'RATE_LIMIT_TOO_MANY_REQUESTS',
              {
                logContext: {
                  key: key.split(':').slice(0, -1).join(':') +
                    ':' + key.split(':').pop()!.slice(0, 8),
                  limit: options.limit,
                  window: options.window,
                  reset: result.reset,
                },
              },
            ),
          )
          err.headers.set('Retry-After', String(Math.ceil((result.reset - Date.now()) / 1000)))
          if (mostRestrictive) {
            setRateLimitHeaders(
              err,
              options.limit,
              mostRestrictive.remaining,
              mostRestrictive.reset,
            )
          }
          return err
        }
      }

      const response = await handler(request, context)
      if (mostRestrictive) {
        setRateLimitHeaders(
          response,
          options.limit,
          mostRestrictive.remaining,
          mostRestrictive.reset,
        )
      }
      return response
    } catch (error) {
      if (error instanceof AppError) {
        return handleRouteError(error)
      }
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'Rate limiter unavailable, failing open',
        error: (error as Error).message,
      }))
      return handler(request, context)
    }
  }
}
