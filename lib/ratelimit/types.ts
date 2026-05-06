import type { ErrorCode } from '@/lib/errors/registry'

export type KeyStrategy = 'ip' | 'user' | 'ip+user'

export interface RateLimitOptions {
  limit: number
  window: number
  keyStrategy: KeyStrategy
  errorCode?: ErrorCode
  bypassRoles?: string[]
}
