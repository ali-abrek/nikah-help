import { AppError } from './app-error'
import type { ErrorResponse } from './types'
import { logError } from './logger'
import { getErrorMessage } from './messages'

export type ServerActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: ErrorResponse }

// PostgREST error codes that indicate an authentication or permission problem.
// 42501  = SQL-standard "insufficient privilege" (missing table/schema grants)
// PGRST301 = RLS policy violation
// PGRST102 = Bad or missing JWT
// PGRST104 = JWT role lacks permission
const AUTH_POSTGREST_CODES = new Set(['42501', 'PGRST301', 'PGRST102', 'PGRST104'])

// PostgREST error codes that indicate a client input problem.
// 23505 = unique_violation (duplicate key)
// 23514 = check_violation
const VALIDATION_POSTGREST_CODES = new Set(['23505', '23514'])

function isPostgrestError(
  error: unknown,
): error is Error & { code: string; details: string; hint: string } {
  return (
    error instanceof Error &&
    error.name === 'PostgrestError' &&
    typeof (error as unknown as Record<string, unknown>).code === 'string'
  )
}

export function handleActionError(
  error: unknown,
  locale: 'ru' | 'en' = 'ru',
): { success: false; error: ErrorResponse } {
  if (error instanceof AppError) {
    logError(error)
    const body = error.toResponse()
    if (body.message === error.code) {
      body.message = getErrorMessage(error.code, locale)
    }
    return { success: false, error: body }
  }

  if (isPostgrestError(error)) {
    // Map known PostgREST error codes to application error codes so the
    // client shows a meaningful message instead of a generic 500.
    if (AUTH_POSTGREST_CODES.has(error.code)) {
      const appError = new AppError('AUTH_UNAUTHORIZED', {
        details: { pg_code: error.code, pg_details: error.details },
        cause: error,
      })
      logError(appError)
      const body = appError.toResponse()
      body.message = getErrorMessage('AUTH_UNAUTHORIZED', locale)
      return { success: false, error: body }
    }

    if (VALIDATION_POSTGREST_CODES.has(error.code)) {
      const appError = new AppError('VALIDATION_INVALID_INPUT', {
        details: { pg_code: error.code, pg_details: error.details },
        cause: error,
      })
      logError(appError)
      const body = appError.toResponse()
      body.message = getErrorMessage('VALIDATION_INVALID_INPUT', locale)
      return { success: false, error: body }
    }
  }

  const internal = new AppError('SYSTEM_INTERNAL_ERROR', {
    cause: error instanceof Error ? error : undefined,
  })
  logError(internal)
  const body = internal.toResponse()
  body.message = getErrorMessage('SYSTEM_INTERNAL_ERROR', locale)
  return { success: false, error: body }
}
