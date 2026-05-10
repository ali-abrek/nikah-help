import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'

// The proxy at proxy.ts excludes /api/, so it does not inject `x-user-id`
// on Route Handlers. Without this wrapper, any handler that reads that
// header trusts an attacker-controlled value. `withAuth` calls getClaims
// against the user's session cookies, then overwrites the spoofable
// headers with the verified values so downstream wrappers (rate-limit,
// idempotency) and the handler itself can rely on them.
export function withAuth<T = unknown>(
  handler: (request: NextRequest, context: T) => Promise<NextResponse>,
): (request: NextRequest, context: T) => Promise<NextResponse> {
  return async (request, context) => {
    try {
      const supabase = await createServerSupabase()
      const { data, error } = await supabase.auth.getClaims()
      if (error || !data?.claims) {
        throw new AppError('AUTH_UNAUTHORIZED')
      }
      const claims = data.claims as Record<string, unknown>
      const userId = claims.sub
      if (typeof userId !== 'string' || userId.length === 0) {
        throw new AppError('AUTH_UNAUTHORIZED')
      }
      const role = typeof claims.role === 'string' ? claims.role : 'user'

      request.headers.set('x-user-id', userId)
      request.headers.set('x-user-role', role)

      return handler(request, context)
    } catch (error) {
      return handleRouteError(error)
    }
  }
}
