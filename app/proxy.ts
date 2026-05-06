import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { requireEnv } from '@/lib/env'

// Validate env on first request (idempotent — runs once).
// Must be imported dynamically so it doesn't throw at build time on non-Vercel.
import('@/lib/env').then((m) => m.validateEnv()).catch((err) => {
  console.error('[proxy] Env validation failed:', err)
})

const PROTECTED_PATHS = ['/dashboard', '/onboarding', '/feed']

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
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  try {
    const { data, error } = await supabase.auth.getClaims()

    if (error || !data?.claims) {
      // No valid session
      if (PROTECTED_PATHS.some((p) => url.pathname.startsWith(p))) {
        url.pathname = '/auth'
        url.searchParams.set('error', 'AUTH_UNAUTHORIZED')
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }

    const claims = data.claims as Record<string, unknown>
    const userId = claims.sub as string

    // Set headers for downstream handlers
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', userId)
    requestHeaders.set('x-user-role', (claims.role as string) ?? 'user')

    // Check suspension
    const { data: suspended } = await supabase.rpc('is_user_suspended', {
      p_user: userId,
    })

    if (suspended) {
      await supabase.auth.signOut()
      url.pathname = '/blocked'
      return NextResponse.redirect(url)
    }

    // Forward with headers and refreshed cookies
    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  } catch {
    // Unexpected proxy error — let through for public paths, redirect for protected
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)',
  ],
}
