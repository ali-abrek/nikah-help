import { NextResponse } from 'next/server'

export function setRateLimitHeaders(
  response: NextResponse,
  limit: number,
  remaining: number,
  reset: number,
): void {
  response.headers.set('X-RateLimit-Limit', String(limit))
  response.headers.set('X-RateLimit-Remaining', String(remaining))
  // reset from @upstash/ratelimit is milliseconds; HTTP spec uses Unix seconds.
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(reset / 1000)))
}
