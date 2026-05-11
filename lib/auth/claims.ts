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
