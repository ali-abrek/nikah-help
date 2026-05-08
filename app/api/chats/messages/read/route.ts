import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { markAsRead } from '@/features/chat/server/mark-as-read'
import { markAsReadSchema } from '@/features/chat/schemas'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()

  if (!claims) {
    return NextResponse.json(
      { code: 'AUTH_UNAUTHORIZED', message: 'Требуется авторизация', trace_id: crypto.randomUUID(), status: 401 },
      { status: 401 },
    )
  }

  const userId = (claims as Record<string, unknown>).sub as string

  try {
    const body = await request.json()
    const parsed = markAsReadSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          code: 'VALIDATION_INVALID_INPUT',
          message: 'Некорректные данные',
          trace_id: crypto.randomUUID(),
          status: 422,
        },
        { status: 422 },
      )
    }

    await markAsRead({
      chatId: parsed.data.chat_id,
      messageIds: parsed.data.message_ids,
      userId,
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const appErr = error as { status?: number; toResponse?: () => Record<string, unknown> }
    if (appErr.toResponse) {
      const resp = appErr.toResponse()
      return NextResponse.json(resp, { status: appErr.status ?? 500 })
    }
    return NextResponse.json(
      { code: 'SYSTEM_INTERNAL_ERROR', message: 'Ошибка сервера', trace_id: crypto.randomUUID(), status: 500 },
      { status: 500 },
    )
  }
}
