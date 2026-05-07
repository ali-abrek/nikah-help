import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'
import { togglePublish } from '@/features/profile/server/toggle-publish'

export const POST = withRateLimit(async (_request: NextRequest) => {
  try {
    const supabase = await createServerSupabase()
    const { data: claims, error } = await supabase.auth.getClaims()

    if (error || !claims) {
      throw new AppError('AUTH_UNAUTHORIZED')
    }

    const userId = (claims as Record<string, unknown>).sub as string
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
}, ACTION_MODERATE)
