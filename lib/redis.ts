import { Redis } from '@upstash/redis'
import { requireEnv } from '@/lib/env'

let _redis: Redis | null = null

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: requireEnv('UPSTASH_REDIS_REST_URL'),
      token: requireEnv('UPSTASH_REDIS_REST_TOKEN'),
      enableAutoPipelining: true,
    })
  }
  return _redis
}
