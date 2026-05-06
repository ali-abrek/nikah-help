import { NextResponse } from 'next/server'

export function setRateLimitHeaders(
  response: NextResponse,
  limit: number,
  remaining: number,
  reset: number,
): void {
  response.headers.set('X-RateLimit-Limit', String(limit))
  response.headers.set('X-RateLimit-Remaining', String(remaining))
  response.headers.set('X-RateLimit-Reset', String(reset))
}
