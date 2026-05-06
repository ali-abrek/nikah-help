import type { ErrorCode } from './registry'
import { STATUS_MAP } from './registry'
import type { ErrorResponse } from './types'

interface AppErrorOptions {
  message?: string
  details?: Record<string, string>
  cause?: Error
  logContext?: Record<string, unknown>
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: Record<string, string>
  readonly cause?: Error
  readonly logContext?: Record<string, unknown>
  readonly traceId: string

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? code)
    this.name = 'AppError'
    this.code = code
    this.status = STATUS_MAP[code]
    this.details = options.details
    this.cause = options.cause
    this.logContext = options.logContext
    this.traceId = crypto.randomUUID()
  }

  toResponse(): ErrorResponse {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      trace_id: this.traceId,
      status: this.status,
    }
  }
}
