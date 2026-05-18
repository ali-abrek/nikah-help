import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'
import { togglePrivateMode } from '@/features/profile/server/toggle-private-mode'
import { captureSentryException } from '@/lib/sentry/capture'

export const runtime = 'nodejs'

export const POST = withAuth(
  withRateLimit(async (request: NextRequest) => {
    try {
      const userId = request.headers.get('x-user-id')!
      const body = (await request.json().catch(() => ({}))) as { enabled?: boolean }

      if (typeof body.enabled !== 'boolean') {
        throw new AppError('VALIDATION_INVALID_INPUT', {
          message: '`enabled` must be a boolean',
        })
      }

      const supabase = await createServerSupabase()
      await togglePrivateMode(supabase, userId, body.enabled)

      return NextResponse.json({ success: true, private_mode: body.enabled })
    } catch (error) {
      void captureSentryException(error, {
        flow: 'action.toggle_private_mode',
        severity: 'error',
      })
      return handleRouteError(error)
    }
  }, ACTION_MODERATE),
)
