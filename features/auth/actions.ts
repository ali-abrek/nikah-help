'use server'

import type { ServerActionResult } from '@/lib/errors/action'
import { requestMagicLink } from '@/features/auth/server/send-magic-link'

export async function sendMagicLink(
  _prev: ServerActionResult<{ message: string }> | null,
  formData: FormData,
): Promise<ServerActionResult<{ message: string }>> {
  // TEMPORARY: unconditional early-return to confirm whether the action
  // body executes at all. Will be removed once diagnosed.
  console.error('[debug] sendMagicLink action body entered v2')
  return {
    success: true,
    data: { message: 'DEBUG v2: action body executed' },
  }

  console.error(JSON.stringify({
    level: 'info',
    message: 'send_magic_link_action_start',
    has_email: typeof formData.get('email') === 'string',
    upstash_url_set: Boolean(process.env.UPSTASH_REDIS_REST_URL),
    upstash_token_set: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
    supabase_url_set: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabase_key_set: Boolean(
      process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  }))

  try {
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
