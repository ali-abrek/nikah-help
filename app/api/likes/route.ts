import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { sendLike } from '@/features/likes/server/send-like'
import { revokeLike } from '@/features/likes/server/revoke-like'
import { sendLikeSchema } from '@/features/likes/schemas'
import { handleRouteError } from '@/lib/errors/handler'
import { withIdempotency } from '@/lib/idempotency/with-idempotency'

async function handler(request: NextRequest) {
  try {
    const supabase = await createServerSupabase()

    const { data: claims } = await supabase.auth.getClaims()
    if (!claims) {
      return NextResponse.json(
        { code: 'AUTH_UNAUTHORIZED', message: 'Требуется авторизация' },
        { status: 401 },
      )
    }

    const userId = (claims as Record<string, unknown>).sub as string

    const body = await request.json()
    const { action, to_user_id } = body as {
      to_user_id?: string
      action?: string
    }

    if (!to_user_id || typeof to_user_id !== 'string') {
      return NextResponse.json(
        { code: 'VALIDATION_INVALID_INPUT', message: 'to_user_id обязателен' },
        { status: 422 },
      )
    }

    // Validate UUID
    const parsed = sendLikeSchema.safeParse({ to_user_id })
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_INVALID_INPUT', message: 'Некорректный ID пользователя' },
        { status: 422 },
      )
    }

    if (action === 'unlike') {
      await revokeLike({
        fromUserId: userId,
        toUserId: parsed.data.to_user_id,
      })
      return NextResponse.json({ success: true, matched: false })
    }

    // Default: like
    const result = await sendLike({
      fromUserId: userId,
      toUserId: parsed.data.to_user_id,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return handleRouteError(error)
  }
}

export const POST = withIdempotency(handler)
