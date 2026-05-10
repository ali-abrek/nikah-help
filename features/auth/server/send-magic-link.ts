import { headers } from 'next/headers'
import { emailSchema } from '@/features/auth/schemas'
import { createServerSupabase } from '@/lib/supabase/server'
import { validationError } from '@/lib/errors/validation'
import { getSiteUrl } from '@/lib/utils/site-url'
import { getRatelimit } from '@/lib/ratelimit/client'
import { extractIp, hashIp } from '@/lib/utils/ip'
import type { ServerActionResult } from '@/lib/errors/action'

// Lazy: instantiating the limiter requires UPSTASH_REDIS_REST_URL/TOKEN, and
// resolving those at module load would fail the import and surface as an
// opaque server-action 500 instead of the structured response below.
let _authRatelimit: ReturnType<typeof getRatelimit> | null = null
function getAuthRatelimit() {
  if (!_authRatelimit) _authRatelimit = getRatelimit(3, 60) // 3 attempts per 60s
  return _authRatelimit
}

export async function requestMagicLink(
  email: string,
): Promise<ServerActionResult<{ message: string }>> {
  const parsed = emailSchema.safeParse({ email })

  if (!parsed.success) {
    const err = validationError(parsed.error)
    return { success: false, error: err.toResponse() }
  }

  // Rate limit by IP, email, and the (IP, email) pair so that an attacker
  // can't enumerate accounts by rotating IPs against the same address.
  const headerList = await headers()
  const ip = hashIp(extractIp(headerList))
  const lowerEmail = parsed.data.email.toLowerCase()
  const keys = [
    `nikah-help:auth:magic-link:ip:${ip}`,
    `nikah-help:auth:magic-link:email:${lowerEmail}`,
    `nikah-help:auth:magic-link:pair:${ip}:${lowerEmail}`,
  ]

  let authRatelimit: ReturnType<typeof getRatelimit>
  try {
    authRatelimit = getAuthRatelimit()
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'auth_ratelimit_unavailable',
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    return {
      success: false,
      error: {
        code: 'SYSTEM_INTERNAL_ERROR',
        message: 'Сервис временно недоступен. Попробуйте позже или свяжитесь с поддержкой.',
        trace_id: crypto.randomUUID(),
        status: 503,
      },
    }
  }

  for (const key of keys) {
    let result: { success: boolean }
    try {
      result = await authRatelimit.limit(key, { rate: 1 })
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'auth_ratelimit_call_failed',
          key,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          upstash_url_set: Boolean(process.env.UPSTASH_REDIS_REST_URL),
          upstash_token_set: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
          upstash_url_host: process.env.UPSTASH_REDIS_REST_URL?.slice(0, 24),
        }),
      )
      return {
        success: false,
        error: {
          code: 'SYSTEM_INTERNAL_ERROR',
          message: 'Сервис временно недоступен. Попробуйте позже или свяжитесь с поддержкой.',
          trace_id: crypto.randomUUID(),
          status: 503,
        },
      }
    }
    if (!result.success) {
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

  let supabase: Awaited<ReturnType<typeof createServerSupabase>>
  let otpError: Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>['error']
  try {
    supabase = await createServerSupabase()
    const result = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        emailRedirectTo: `${getSiteUrl()}/api/auth/callback`,
      },
    })
    otpError = result.error
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'auth_signinwithotp_threw',
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }),
    )
    return {
      success: false,
      error: {
        code: 'SYSTEM_INTERNAL_ERROR',
        message: 'Сервис временно недоступен. Попробуйте позже.',
        trace_id: crypto.randomUUID(),
        status: 503,
      },
    }
  }

  if (otpError) {
    const error = otpError
    // Banned emails: log server-side but return the same generic success
    // shape as the happy path so a caller cannot enumerate which addresses
    // are banned. Internal errors are still surfaced to the user.
    if (error.code === 'BAN01') {
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: 'magic_link_request_for_banned_email',
          emailHash: hashIp(lowerEmail),
        }),
      )
      return {
        success: true,
        data: { message: 'Проверьте почту — мы отправили ссылку для входа' },
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
