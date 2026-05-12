import { headers, cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'
import { requireEnv } from '@/lib/env'

/**
 * Extracts and validates `sub` from auth claims. Returns `null` when the
 * claim is missing or malformed — callers decide whether to redirect, throw,
 * or return an unauthorized result.
 */
export function getUserId(claims: Record<string, unknown>): string | null {
  const sub = claims.sub
  if (typeof sub === 'string' && sub.length > 0) return sub
  return null
}

/**
 * Reads `x-user-id` injected by `proxy.ts` (page routes) or `withAuth`
 * (API routes). Falls back to direct JWT verification when the header
 * is missing — Next.js 16 may not forward proxy-set headers into the
 * Server Action context.
 */
export async function getServerUserId(): Promise<string | null> {
  const h = await headers()
  const fromHeader = h.get('x-user-id')
  if (fromHeader) return fromHeader

  const cookieStore = await cookies()
  const supabase = createServerClient<Database>(
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

  const { data } = await supabase.auth.getClaims()
  if (data?.claims) {
    return getUserId(data.claims as Record<string, unknown>)
  }

  return null
}
