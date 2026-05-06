import { AppError } from './app-error'

export function logError(error: AppError): void {
  console.error(JSON.stringify({
    level: 'error',
    code: error.code,
    status: error.status,
    message: error.message,
    trace_id: error.traceId,
    context: error.logContext ?? {},
    cause: error.cause?.message ?? null,
  }))

  // TODO: Integrate Sentry for 5xx errors when @sentry/nextjs is set up:
  // if (error.status >= 500) {
  //   Sentry.captureException(error.cause ?? error, {
  //     tags: { error_code: error.code, trace_id: error.traceId },
  //     extra: { logContext: error.logContext, traceId: error.traceId },
  //   })
  // }
}
