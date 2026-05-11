import type { NextRequest, NextResponse } from 'next/server'

type CronHandler = (request: NextRequest) => Promise<NextResponse>

// Wraps a Vercel Cron route handler with Sentry cron monitoring.
//
// On each successful run, Sentry receives a check-in heartbeat so the cron
// appears in Sentry Crons. If the job does not fire within the expected
// window, Sentry raises a missed-run alert (flow=cron.*).
//
// slug convention: cron.<vercel-route-slug>  e.g. 'cron.expire-suspensions'
export function withSentryMonitor(
  slug: string,
  handler: CronHandler,
  schedule: string,
): CronHandler {
  return async (request: NextRequest): Promise<NextResponse> => {
    const dsn = process.env.SENTRY_DSN
    if (!dsn) return handler(request)

    const { withMonitor } = await import('@sentry/nextjs')
    return withMonitor(slug, () => handler(request), {
      schedule: { type: 'crontab', value: schedule },
      checkinMargin: 2,
      maxRuntime: 10,
      timezone: 'UTC',
    }) as Promise<NextResponse>
  }
}
