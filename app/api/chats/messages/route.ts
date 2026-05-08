import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { sendMessage } from '@/features/chat/server/send-message'
import { sendMessageSchema } from '@/features/chat/schemas'

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

  const raw = Object.fromEntries(await request.formData())
  const parsed = sendMessageSchema.safeParse(raw)

  if (!parsed.success) {
    return NextResponse.json(
      {
        code: 'VALIDATION_INVALID_INPUT',
        message: 'Некорректные данные',
        trace_id: crypto.randomUUID(),
        status: 422,
        details: Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        ),
      },
      { status: 422 },
    )
  }

  try {
    const result = await sendMessage({
      chatId: parsed.data.chat_id,
      senderId: userId,
      type: parsed.data.type,
      content: parsed.data.content,
      parentId: parsed.data.parent_id,
    })

    return NextResponse.json(result, { status: 201 })
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
