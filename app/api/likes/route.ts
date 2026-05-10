import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sendLike } from '@/features/likes/server/send-like'
import { revokeLike } from '@/features/likes/server/revoke-like'
import { sendLikeSchema } from '@/features/likes/schemas'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'
import { withAuth } from '@/lib/api/with-auth'
import { withIdempotency } from '@/lib/idempotency/with-idempotency'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'
import { USER_ACTION } from '@/lib/idempotency/presets'

const likeBodySchema = sendLikeSchema.extend({
  action: z.enum(['like', 'unlike']).optional(),
})

async function handler(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')!

    const body = await request.json().catch(() => ({}))
    const parsed = likeBodySchema.safeParse(body)
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors
      const details: Record<string, string> = {}
      for (const [field, errs] of Object.entries(fieldErrors)) {
        if (errs && errs.length) details[field] = errs[0]!
      }
      throw new AppError('VALIDATION_INVALID_INPUT', { details })
    }

    const { action, to_user_id } = parsed.data

    if (action === 'unlike') {
      await revokeLike({
        fromUserId: userId,
        toUserId: to_user_id,
      })
      return NextResponse.json({ success: true, matched: false })
    }

    const result = await sendLike({
      fromUserId: userId,
      toUserId: to_user_id,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return handleRouteError(error)
  }
}

export const POST = withAuth(withRateLimit(withIdempotency(handler, USER_ACTION), ACTION_MODERATE))
