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
  '/chats',
  '/profile',
  '/likes',
  '/notifications',
  '/settings',
  '/moderation',
]

export async function proxy(request: NextRequest) {
  // Mutated below from setAll; recreating it from the (already-mutated)
  // `request` is what guarantees Next.js forwards the refreshed cookies to
  // the downstream Server Action / RSC. See the comment in setAll.
  let supabaseResponse = NextResponse.next({ request })
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
          // 1. Mutate `request.cookies` so the *next* `NextResponse.next({
          //    request })` snapshot carries the refreshed JWT through to the
          //    downstream handler.
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          // 2. Recreate the response from the now-mutated request. Skipping
          //    this step is what previously caused AUTH_UNAUTHORIZED in
          //    Server Actions after a token refresh: the forwarded request
          //    still carried the stale cookies.
          supabaseResponse = NextResponse.next({ request })
          // 3. Mirror the cookies onto the outgoing response so the browser
          //    also receives the refreshed Set-Cookie headers.
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
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

    const suspended = await isUserSuspendedCached(supabase, userId)

    if (suspended) {
      await supabase.auth.signOut()
      url.pathname = '/blocked'
      return NextResponse.redirect(url)
    }

    // Follow the documented Next.js pattern for setting request headers:
    // clone request.headers (which now reflects any cookie mutations from
    // setAll because RequestCookies.set writes back to its _headers), add
    // our auth headers, and pass via `request: { headers: requestHeaders }`.
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', userId)
    requestHeaders.set('x-user-role', (claims.role as string) ?? 'user')

    const final = NextResponse.next({ request: { headers: requestHeaders } })
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      final.cookies.set(cookie.name, cookie.value, cookie)
    })
    return final
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
