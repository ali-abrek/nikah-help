import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { setPreference } from '@/features/notifications/server/get-preferences'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'

const prefSchema = z.object({
  type: z.string().min(1).max(64),
  enabled: z.boolean(),
})

export const POST = withAuth(
  withRateLimit(async (req: NextRequest) => {
    try {
      const userId = req.headers.get('x-user-id')!
      const body = await req.json().catch(() => ({}))
      const parsed = prefSchema.safeParse(body)
      if (!parsed.success) {
        throw new AppError('VALIDATION_INVALID_INPUT', {
          details: parsed.error.flatten().fieldErrors as Record<string, string>,
        })
      }
      await setPreference(userId, parsed.data.type, parsed.data.enabled)
      return NextResponse.json({ success: true })
    } catch (error) {
      return handleRouteError(error)
    }
  }, ACTION_MODERATE),
)
