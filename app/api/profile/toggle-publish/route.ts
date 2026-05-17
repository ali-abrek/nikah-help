import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'
import { togglePublish } from '@/features/profile/server/toggle-publish'

export const runtime = 'nodejs'

export const POST = withAuth(
  withRateLimit(async (request: NextRequest) => {
    try {
      const userId = request.headers.get('x-user-id')!
      const supabase = await createServerSupabase()
      const result = await togglePublish(supabase, userId)

      if (!result.success) {
        throw new AppError(
          result.errorCode ?? 'PROFILE_NO_APPROVED_PHOTO',
          result.errorMessage ? { message: result.errorMessage } : {},
        )
      }

      return NextResponse.json(result)
    } catch (error) {
      return handleRouteError(error)
    }
  }, ACTION_MODERATE),
)
