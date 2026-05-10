import { AppError } from './app-error'
import { getEnv } from '@/lib/env'

export function logError(error: AppError): void {
  console.error(
    JSON.stringify({
      level: 'error',
      code: error.code,
      status: error.status,
      message: error.message,
      trace_id: error.traceId,
      context: error.logContext ?? {},
      cause: error.cause?.message ?? null,
    }),
  )

  // Forward 5xx to Sentry. 4xx are client/validation errors that would
  // pollute alerting volume — we keep them in stdout/Logflare only.
  if (error.status >= 500 && getEnv('SENTRY_DSN')) {
    // Lazy-import so client/edge bundles that never call logError do not
    // pull in @sentry/nextjs.
    import('@sentry/nextjs')
      .then((Sentry) => {
        Sentry.captureException(error.cause ?? error, {
          tags: { error_code: error.code, trace_id: error.traceId },
          extra: { logContext: error.logContext, traceId: error.traceId },
        })
      })
      .catch(() => {
        // Swallow — Sentry being unavailable should never break the request.
      })
  }
}
