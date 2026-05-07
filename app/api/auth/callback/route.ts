import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireEnv } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashBlockedEmail } from '@/lib/crypto/email-hash'

function safeRedirect(url: string, fallback: string): string {
  // Only allow same-site relative paths, reject protocol-relative and absolute URLs
  if (url.startsWith('/') && !url.startsWith('//')) return url
  return fallback
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeRedirect(searchParams.get('next') ?? '', '/feed')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_PUBLISHABLE_KEY'),
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          },
        },
      },
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

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
          console.error(JSON.stringify({
            level: 'error',
            message: 'block_rebind_failed',
            userId,
            error: rebindErr instanceof Error ? rebindErr.message : String(rebindErr),
          }))
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', userId)
          .single()

        if (!profile?.onboarding_completed) {
          return NextResponse.redirect(new URL('/onboarding', request.url))
        }
      }

      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  return NextResponse.redirect(new URL('/auth?error=auth_callback_failed', request.url))
}
