import { headers } from 'next/headers'
import { emailSchema } from '@/features/auth/schemas'
import { createServerSupabase } from '@/lib/supabase/server'
import { validationError } from '@/lib/errors/validation'
import { getSiteUrl } from '@/lib/utils/site-url'
import { getRatelimit } from '@/lib/ratelimit/client'
import { extractIp, hashIp } from '@/lib/utils/ip'
import type { ServerActionResult } from '@/lib/errors/action'

const authRatelimit = getRatelimit(3, 60) // 3 attempts per 60s

export async function requestMagicLink(
  email: string,
): Promise<ServerActionResult<{ message: string }>> {
  const parsed = emailSchema.safeParse({ email })

  if (!parsed.success) {
    const err = validationError(parsed.error)
    return { success: false, error: err.toResponse() }
  }

  // Rate limit by IP and email
  const headerList = await headers()
  const ip = hashIp(extractIp(headerList))
  const keys = [
    `nikah-help:auth:magic-link:ip:${ip}`,
    `nikah-help:auth:magic-link:email:${parsed.data.email.toLowerCase()}`,
  ]

  for (const key of keys) {
    const { success } = await authRatelimit.limit(key, { rate: 1 })
    if (!success) {
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_AUTH_CALLBACK',
          message: 'Слишком много попыток. Попробуйте через минуту.',
          trace_id: crypto.randomUUID(),
          status: 429,
        },
      }
    }
  }

  const supabase = await createServerSupabase()

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${getSiteUrl()}/api/auth/callback`,
    },
  })

  if (error) {
    if (error.code === 'BAN01') {
      return {
        success: false,
        error: {
          code: 'AUTH_EMAIL_BANNED',
          message: 'Этот email заблокирован модератором',
          trace_id: crypto.randomUUID(),
          status: 403,
        },
      }
    }
    return {
      success: false,
      error: {
        code: 'SYSTEM_INTERNAL_ERROR',
        message: error.message,
        trace_id: crypto.randomUUID(),
        status: 500,
      },
    }
  }

  return {
    success: true,
    data: { message: 'Проверьте почту — мы отправили ссылку для входа' },
  }
}
