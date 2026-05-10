import { NextRequest } from 'next/server'
import { AppError } from '@/lib/errors/app-error'
import { requireEnv } from '@/lib/env'
import { timingSafeEqual } from 'node:crypto'

// Vercel Cron sends `Authorization: Bearer <VERCEL_CRON_SECRET>` to scheduled
// endpoints. Reject anything else so a hand-crafted request can't trigger
// the job.
export function assertCronAuth(request: NextRequest): void {
  const header = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${requireEnv('VERCEL_CRON_SECRET')}`

  if (header.length !== expected.length) {
    throw new AppError('AUTH_UNAUTHORIZED')
  }
  if (!timingSafeEqual(Buffer.from(header), Buffer.from(expected))) {
    throw new AppError('AUTH_UNAUTHORIZED')
  }
}
