import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { getRedis } from '@/lib/redis'

const TTL_SECONDS = 30
const KEY_PREFIX = 'suspended:v1:'

// Cache key for is_user_suspended RPC. The proxy hits this on every protected
// request — without caching that's a Postgres round-trip per navigation.
//
// Failure mode: on Redis unavailability we fall through to the RPC so a
// suspended user is still blocked; we just lose the cache on that request.
export async function isUserSuspendedCached(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const key = `${KEY_PREFIX}${userId}`

  try {
    const cached = await getRedis().get<string>(key)
    if (cached === '1') return true
    if (cached === '0') return false
  } catch {
    // Redis miss/unavailable — fall through to live check.
  }

  const { data } = await supabase.rpc('is_user_suspended', { p_user: userId })
  const suspended = Boolean(data)

  try {
    await getRedis().set(key, suspended ? '1' : '0', { ex: TTL_SECONDS })
  } catch {
    // Best-effort cache write.
  }

  return suspended
}

// Call this from suspension/lift admin actions to invalidate the cache for
// a user immediately rather than waiting for the 30s TTL.
export async function invalidateSuspensionCache(userId: string): Promise<void> {
  try {
    await getRedis().del(`${KEY_PREFIX}${userId}`)
  } catch {
    // Best effort.
  }
}
