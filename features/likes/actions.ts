'use server'

import { sendLike } from '@/features/likes/server/send-like'
import { sendLikeSchema } from '@/features/likes/schemas'
import { handleActionError } from '@/lib/errors/action'
import type { ServerActionResult } from '@/lib/errors/action'
import { getServerUserId } from '@/lib/auth/claims'

export async function likeUser(
  _prev: ServerActionResult<{ matched: boolean }> | null,
  formData: FormData,
): Promise<ServerActionResult<{ matched: boolean }>> {
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
    const parsed = sendLikeSchema.safeParse(raw)

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

    const result = await sendLike({
      fromUserId: userId,
      toUserId: parsed.data.to_user_id,
    })

    return { success: true, data: result }
  } catch (error) {
    return handleActionError(error)
  }
}
