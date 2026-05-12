'use server'

import { sendMessage } from '@/features/chat/server/send-message'
import { sendMessageSchema } from '@/features/chat/schemas'
import { handleActionError } from '@/lib/errors/action'
import type { ServerActionResult } from '@/lib/errors/action'
import { getServerUserId } from '@/lib/auth/claims'

export async function sendMessageAction(
  _prev: ServerActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ServerActionResult<{ id: string }>> {
  try {
    const userId = await getServerUserId()
    if (!userId) {
      return {
        success: false,
        error: {
          code: 'AUTH_UNAUTHORIZED',
          message: 'Требуется авторизация',
          trace_id: crypto.randomUUID(),
          status: 401,
        },
      }
    }

    const raw = Object.fromEntries(formData)
    const parsed = sendMessageSchema.safeParse(raw)

    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_INVALID_INPUT',
          message: 'Некорректные данные',
          trace_id: crypto.randomUUID(),
          status: 422,
          details: Object.fromEntries(
            parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
          ),
        },
      }
    }

    const result = await sendMessage({
      chatId: parsed.data.chat_id,
      senderId: userId,
      type: parsed.data.type,
      content: parsed.data.content,
      parentId: parsed.data.parent_id,
    })

    return { success: true, data: { id: result.id } }
  } catch (error) {
    return handleActionError(error)
  }
}
