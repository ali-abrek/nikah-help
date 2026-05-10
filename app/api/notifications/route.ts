import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getNotifications } from '@/features/notifications/server/get-notifications'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { READ_GENEROUS } from '@/lib/ratelimit/presets'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'

const querySchema = z.object({
  cursor: z.string().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const GET = withAuth(
  withRateLimit(async (req: NextRequest) => {
    try {
      const userId = req.headers.get('x-user-id')!
      const parsed = querySchema.safeParse({
        cursor: req.nextUrl.searchParams.get('cursor') ?? undefined,
        limit: req.nextUrl.searchParams.get('limit') ?? undefined,
      })
      if (!parsed.success) {
        throw new AppError('VALIDATION_INVALID_INPUT', {
          details: { query: parsed.error.message },
        })
      }
      const notifications = await getNotifications(userId, {
        cursor: parsed.data.cursor,
        limit: parsed.data.limit ?? 20,
      })
      return NextResponse.json(notifications)
    } catch (error) {
      return handleRouteError(error)
    }
  }, READ_GENEROUS),
)
