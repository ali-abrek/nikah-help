import { Ratelimit } from '@upstash/ratelimit'
import { getRedis } from '@/lib/redis'

const instances = new Map<string, Ratelimit>()

export function getRatelimit(limit: number, window: number): Ratelimit {
  const cacheKey = `${limit}:${window}`
  const cached = instances.get(cacheKey)
  if (cached) return cached

  const instance = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(limit, `${window} s`),
    analytics: true,
    timeout: 3000,
  })
  instances.set(cacheKey, instance)
  return instance
}
