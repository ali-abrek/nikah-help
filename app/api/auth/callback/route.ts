import { NextResponse } from 'next/server'
import { createRouteSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashBlockedEmail } from '@/lib/crypto/email-hash'
import { captureSentryException } from '@/lib/sentry/capture'

// Strict allowlist of post-login destinations. Anything else falls through
// to /feed so a crafted `?next=…` parameter can't be used for misdirection
// or to land an authenticated user on an unintended internal route.
const SAFE_NEXT_PATHS = new Set([
  '/feed',
  '/onboarding',
  '/dashboard',
  '/profile',
  '/profile/edit',
  '/settings',
  '/notifications',
  '/likes',
  '/chats',
])

function safeRedirect(url: string, fallback: string): string {
  if (!url) return fallback
  // Strip query/fragment when matching the allowlist; preserve them on
  // pass through so the destination retains caller-intended state.
  const path = url.split(/[?#]/)[0] ?? ''
  if (SAFE_NEXT_PATHS.has(path)) return url
  return fallback
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeRedirect(searchParams.get('next') ?? '', '/feed')

  if (code) {
    const { supabase, applyCookies } = await createRouteSupabase()

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      void captureSentryException(error, {
        flow: 'auth.callback',
        severity: 'error',
        tags: { step: 'exchange_code' },
      })
    }

    if (!error) {
      const { data: userData } = await supabase.auth.getUser()
      const user = userData?.user
      const userId = user?.id

      if (userId && user?.email) {
        // Re-bind any "ghost" personal blocks captured against this email
        // before the user (re-)registered. Pepper is server-only so the
        // Postgres trigger cannot do this — see docs/01-auth.md §198.
        try {
          const admin = createAdminClient()
          // PostgREST encodes bytea filters as `\x<hex>`.
          const hexHash = '\\x' + hashBlockedEmail(user.email).toString('hex')
          await admin
            .from('blocks')
            .update({ blocked_id: userId })
            .is('blocked_id', null)
            .eq('blocked_email_hash', hexHash)
        } catch (rebindErr) {
          void captureSentryException(rebindErr, {
            flow: 'auth.callback',
            severity: 'warning',
            tags: { step: 'block_rebind' },
            extra: { traceId: userId },
          })
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', userId)
          .single()

        const redirectUrl = profile?.onboarding_completed
          ? new URL(next, request.url)
          : new URL('/onboarding', request.url)

        const response = NextResponse.redirect(redirectUrl)
        applyCookies(response)
        return response
      }

      const response = NextResponse.redirect(new URL(next, request.url))
      applyCookies(response)
      return response
    }
  }

  return NextResponse.redirect(new URL('/auth?error=auth_callback_failed', request.url))
}
