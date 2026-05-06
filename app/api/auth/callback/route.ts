import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireEnv } from '@/lib/env'

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
      const { data } = await supabase.auth.getClaims()
      const userId = (data?.claims as Record<string, unknown> | null)?.sub as string | undefined

      if (userId) {
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
