'use server'

import type { ServerActionResult } from '@/lib/errors/action'
import { requestMagicLink } from '@/features/auth/server/send-magic-link'

export async function sendMagicLink(
  _prev: ServerActionResult<{ message: string }> | null,
  formData: FormData,
): Promise<ServerActionResult<{ message: string }>> {
  console.error(JSON.stringify({
    level: 'info',
    message: 'send_magic_link_v6_entered',
    prev_type: typeof _prev,
    prev_value: _prev,
    formData_type: typeof formData,
    formData_is_null: formData === null,
    formData_is_undefined: formData === undefined,
    formData_constructor: formData?.constructor?.name,
    formData_keys: formData && typeof (formData as FormData).keys === 'function'
      ? Array.from((formData as FormData).keys())
      : null,
  }))
  try {
    if (!formData || typeof (formData as FormData).get !== 'function') {
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
    const emailRaw = formData.get('email')
    if (typeof emailRaw !== 'string') {
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
    return await requestMagicLink(emailRaw as string)
  } catch (err: unknown) {
    const e = err as Error
    console.error(JSON.stringify({
      level: 'error',
      message: 'send_magic_link_action_threw',
      error: e?.message ?? String(err),
      stack: e?.stack,
      name: e?.name,
    }))
    return {
      success: false,
      error: {
        code: 'SYSTEM_INTERNAL_ERROR',
        message: 'Произошла внутренняя ошибка. Попробуйте позже.',
        trace_id: crypto.randomUUID(),
        status: 500,
      },
    }
  }
}
