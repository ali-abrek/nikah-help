// Next.js calls register() once per server runtime (Node and Edge).
// We initialise Sentry here so server-side errors flow into the same
// project as client errors. The DSN is sourced via getEnv() so that
// missing config (e.g. preview branches without secrets) degrades to
// stdout-only logging rather than throwing.
export async function register() {
  const { getEnv } = await import('@/lib/env')
  const dsn = getEnv('SENTRY_DSN')
  if (!dsn) return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      // We capture errors explicitly via lib/errors/logger.ts; opt out of
      // unhandled-error auto-capture so we don't double-report the same
      // event twice.
      ignoreErrors: [],
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 0.1,
    })
  }
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
  context: {
    routerKind: 'Pages Router' | 'App Router'
    routePath: string
    routeType: 'render' | 'route' | 'action' | 'middleware'
  },
) {
  const { getEnv } = await import('@/lib/env')
  if (!getEnv('SENTRY_DSN')) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(err, request, context)
}
