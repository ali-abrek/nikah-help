import { NextRequest, NextResponse } from 'next/server'
import { markAsRead } from '@/features/chat/server/mark-as-read'
import { markAsReadSchema } from '@/features/chat/schemas'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'

export const runtime = 'nodejs'

const handler = async (request: NextRequest) => {
  try {
    const userId = request.headers.get('x-user-id')!
    const body = await request.json().catch(() => ({}))
    const parsed = markAsReadSchema.safeParse(body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        details: parsed.error.flatten().fieldErrors as Record<string, string>,
      })
    }
    await markAsRead({
      chatId: parsed.data.chat_id,
      messageIds: parsed.data.message_ids,
      userId,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error)
  }
}

export const POST = withAuth(withRateLimit(handler, ACTION_MODERATE))
