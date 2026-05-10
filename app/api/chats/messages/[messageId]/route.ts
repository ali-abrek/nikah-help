import { NextRequest, NextResponse } from 'next/server'
import { editMessage } from '@/features/chat/server/edit-message'
import { deleteMessage } from '@/features/chat/server/delete-message'
import { editMessageSchema } from '@/features/chat/schemas'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'

type RouteCtx = { params: Promise<{ messageId: string }> }

const patchHandler = async (request: NextRequest, ctx: RouteCtx) => {
  try {
    const userId = request.headers.get('x-user-id')!
    const { messageId } = await ctx.params

    const body = await request.json().catch(() => ({}))
    const parsed = editMessageSchema.safeParse({ ...body, message_id: messageId })

    if (!parsed.success) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        details: parsed.error.flatten().fieldErrors as Record<string, string>,
      })
    }

    const result = await editMessage({
      messageId: parsed.data.message_id,
      content: parsed.data.content,
      userId,
    })
    return NextResponse.json(result)
  } catch (error) {
    return handleRouteError(error)
  }
}

const deleteHandler = async (request: NextRequest, ctx: RouteCtx) => {
  try {
    const userId = request.headers.get('x-user-id')!
    const { messageId } = await ctx.params
    await deleteMessage({ messageId, userId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error)
  }
}

export const PATCH = withAuth<RouteCtx>(withRateLimit(patchHandler, ACTION_MODERATE))
export const DELETE = withAuth<RouteCtx>(withRateLimit(deleteHandler, ACTION_MODERATE))
