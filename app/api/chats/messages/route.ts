import { NextRequest, NextResponse } from 'next/server'
import { sendMessage } from '@/features/chat/server/send-message'
import { sendMessageSchema } from '@/features/chat/schemas'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { withIdempotency } from '@/lib/idempotency/with-idempotency'
import { MESSAGE_SEND as MESSAGE_SEND_RL } from '@/lib/ratelimit/presets'
import { MESSAGE_SEND as MESSAGE_SEND_IDEM } from '@/lib/idempotency/presets'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'

const handler = async (request: NextRequest): Promise<NextResponse> => {
  try {
    const userId = request.headers.get('x-user-id')!

    const raw = Object.fromEntries(await request.formData())
    const parsed = sendMessageSchema.safeParse(raw)
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors
      const details: Record<string, string> = {}
      for (const [field, errs] of Object.entries(fieldErrors)) {
        if (errs && errs.length) details[field] = errs[0]!
      }
      throw new AppError('VALIDATION_INVALID_INPUT', { details })
    }

    const result = await sendMessage({
      chatId: parsed.data.chat_id,
      senderId: userId,
      type: parsed.data.type,
      content: parsed.data.content,
      parentId: parsed.data.parent_id,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return handleRouteError(error)
  }
}

export const POST = withAuth(
  withRateLimit(withIdempotency(handler, MESSAGE_SEND_IDEM), MESSAGE_SEND_RL),
)
