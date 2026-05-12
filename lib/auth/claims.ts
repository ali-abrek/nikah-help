import { headers } from 'next/headers'

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
 * (API routes). Both validate the JWT before setting the header, so
 * Server Actions and Route Handlers downstream can trust this value
 * without calling `getClaims()` a second time.
 *
 * Returns `null` when the header is missing — the caller should return
 * an unauthorized result rather than falling back to `getClaims()`.
 */
export async function getServerUserId(): Promise<string | null> {
  const h = await headers()
  return h.get('x-user-id') || null
}
