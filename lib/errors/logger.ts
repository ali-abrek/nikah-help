import { AppError } from './app-error'
import { captureSentryException, deriveFlowFromCode, safeLogContext } from '@/lib/sentry/capture'

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
  if (error.status >= 500) {
    const flow = deriveFlowFromCode(error.code)
    void captureSentryException(error.cause ?? error, {
      // Fall back to 'db.query' for unmapped system errors so they land in
      // a catchall alert bucket rather than being completely unrouted.
      flow: flow ?? 'db.query',
      severity: error.status >= 500 ? 'error' : 'warning',
      tags: { error_code: error.code },
      extra: {
        traceId: error.traceId,
        logContext: safeLogContext(error.logContext),
      },
    })
  }
}
