export { getRatelimit } from './client'
export { resolveKeys } from './keys'
export { withRateLimit } from './with-rate-limit'
export { setRateLimitHeaders } from './headers'
export * from './presets'
export type { RateLimitOptions, KeyStrategy } from './types'

export function getRateLimitKey(userId: string, action: string): string {
  return `${action}:${userId}`
}
