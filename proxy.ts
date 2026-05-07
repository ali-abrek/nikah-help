import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { requireEnv, validateEnv } from '@/lib/env'

// Validated at module load (logs missing vars; does not throw — see env.ts).
validateEnv()

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

    if (error || !data?.claims) {
      if (PROTECTED_PATHS.some((p) => url.pathname.startsWith(p))) {
        url.pathname = '/auth'
        url.searchParams.set('error', 'AUTH_UNAUTHORIZED')
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }

    const claims = data.claims as Record<string, unknown>
    const userId = claims.sub as string

    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', userId)
    requestHeaders.set('x-user-role', (claims.role as string) ?? 'user')

    const { data: suspended } = await supabase.rpc('is_user_suspended', {
      p_user: userId,
    })

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
  } catch {
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
