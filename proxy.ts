import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { requireEnv, validateEnv } from '@/lib/env'
import { validateSiteUrl } from '@/lib/utils/site-url'
import { isUserSuspendedCached } from '@/lib/auth/suspension'
import { getUserId } from '@/lib/auth/claims'
import { captureSentryException } from '@/lib/sentry/capture'

// Validated at module load (logs missing vars; does not throw — see env.ts).
validateEnv()
validateSiteUrl()

const PROTECTED_PATHS = [
  '/dashboard',
  '/onboarding',
  '/feed',
  '/chats',
  '/profile',
  '/likes',
  '/notifications',
  '/settings',
]

export async function proxy(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request })
  const url = request.nextUrl

  const supabase = createServerClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Mirror refreshed Supabase cookies onto the outgoing response.
          // If the response is later replaced (to inject x-user-id headers),
          // we copy these forward so the auth refresh is not lost.
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  try {
    const { data, error } = await supabase.auth.getClaims()

    if (error) {
      // A structured error from getClaims() indicates session parsing failure,
      // token corruption, or Supabase unreachability — not just unauthenticated.
      // Capture it so operators know when session refresh is broken.
      void captureSentryException(error, {
        flow: 'auth.session_refresh',
        severity: 'warning',
        tags: { step: 'get_claims' },
      })
    }

    if (error || !data?.claims) {
      if (PROTECTED_PATHS.some((p) => url.pathname.startsWith(p))) {
        url.pathname = '/auth'
        url.searchParams.set('error', 'AUTH_UNAUTHORIZED')
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }

    const claims = data.claims as Record<string, unknown>
    const userId = getUserId(claims)
    if (!userId) {
      if (PROTECTED_PATHS.some((p) => url.pathname.startsWith(p))) {
        url.pathname = '/auth'
        url.searchParams.set('error', 'AUTH_UNAUTHORIZED')
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }

    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', userId)
    requestHeaders.set('x-user-role', (claims.role as string) ?? 'user')

    const suspended = await isUserSuspendedCached(supabase, userId)

    if (suspended) {
      await supabase.auth.signOut()
      url.pathname = '/blocked'
      return NextResponse.redirect(url)
    }

    // Build the forwarded response with injected headers, then carry
    // over any cookies Supabase wrote on `supabaseResponse` (refreshed
    // session tokens). Skipping this step silently drops cookie refreshes.
    const forwarded = NextResponse.next({
      request: { headers: requestHeaders },
    })
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      forwarded.cookies.set(cookie.name, cookie.value, cookie)
    })
    return forwarded
  } catch (err) {
    void captureSentryException(err, {
      flow: 'edge.proxy',
      severity: 'error',
      tags: { path: url.pathname },
    })
    if (PROTECTED_PATHS.some((p) => url.pathname.startsWith(p))) {
      url.pathname = '/auth'
      url.searchParams.set('error', 'AUTH_UNAUTHORIZED')
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }
}

export const config = {
  matcher: [
    // Exclude: API routes, Sentry tunnel, Next.js internals, static assets.
    '/((?!api/|monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)',
  ],
}
