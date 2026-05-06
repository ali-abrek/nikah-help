'use server'

import type { ServerActionResult } from '@/lib/errors/action'
import { requestMagicLink } from '@/features/auth/server/send-magic-link'

export async function sendMagicLink(
  _prev: ServerActionResult<{ message: string }> | null,
  formData: FormData,
): Promise<ServerActionResult<{ message: string }>> {
  const email = formData.get('email')
  if (typeof email !== 'string') {
    return {
      success: false,
      error: {
        code: 'VALIDATION_INVALID_INPUT',
        message: 'Email обязателен',
        trace_id: crypto.randomUUID(),
        status: 422,
        details: { email: 'Email обязателен' },
      },
    }
  }
  return requestMagicLink(email)
}
