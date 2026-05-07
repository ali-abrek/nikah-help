'use server'

import type { ServerActionResult } from '@/lib/errors/action'
import { requestMagicLink } from '@/features/auth/server/send-magic-link'

export async function sendMagicLink(
  _prev: ServerActionResult<{ message: string }> | null,
  formData: FormData,
): Promise<ServerActionResult<{ message: string }>> {
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
    return await requestMagicLink(email)
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'send_magic_link_action_threw',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      name: err instanceof Error ? err.name : undefined,
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
