import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { editMessage } from '@/features/chat/server/edit-message'
import { deleteMessage } from '@/features/chat/server/delete-message'
import { editMessageSchema } from '@/features/chat/schemas'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()

  if (!claims) {
    return NextResponse.json(
      { code: 'AUTH_UNAUTHORIZED', message: 'Требуется авторизация', trace_id: crypto.randomUUID(), status: 401 },
      { status: 401 },
    )
  }

  const userId = (claims as Record<string, unknown>).sub as string
  const { messageId } = await params

  try {
    const body = await request.json()
    const parsed = editMessageSchema.safeParse({ ...body, message_id: messageId })

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

    const result = await editMessage({
      messageId: parsed.data.message_id,
      content: parsed.data.content,
      userId,
    })

    return NextResponse.json(result)
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()

  if (!claims) {
    return NextResponse.json(
      { code: 'AUTH_UNAUTHORIZED', message: 'Требуется авторизация', trace_id: crypto.randomUUID(), status: 401 },
      { status: 401 },
    )
  }

  const userId = (claims as Record<string, unknown>).sub as string
  const { messageId } = await params

  try {
    await deleteMessage({ messageId, userId })
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
