import { AppError } from './app-error'
import type { ErrorResponse } from './types'
import { logError } from './logger'
import { getErrorMessage } from './messages'

export type ServerActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: ErrorResponse }

// PostgREST/Postgres codes split by intent:
// JWT-level (genuine auth) → AUTH_UNAUTHORIZED (401, prompts re-login).
//   PGRST102 = Bad or missing JWT
//   PGRST104 = JWT role lacks permission
// Privilege-level (the user IS authenticated but RLS or a missing GRANT
// denied the op) → AUTH_FORBIDDEN (403). Mapping these to AUTH_UNAUTHORIZED
// previously masked a project-wide missing-GRANT bug as a session problem.
//   42501    = SQL-standard "insufficient privilege"
//   PGRST301 = RLS policy violation
const AUTH_JWT_CODES = new Set(['PGRST102', 'PGRST104'])
const AUTH_PERMISSION_CODES = new Set(['42501', 'PGRST301'])

// PostgREST error codes that indicate a client input problem.
// 23505 = unique_violation (duplicate key)
// 23514 = check_violation
const VALIDATION_POSTGREST_CODES = new Set(['23505', '23514'])

// Supabase JS v2 with shouldThrowOnError=false (the default) returns errors as
// plain JSON objects { message, code, details, hint }, NOT as PostgrestError
// instances. Accept either shape so our code mapping works in both modes.
function isPostgrestError(
  error: unknown,
): error is { message: string; code: string; details: string; hint: string } {
  if (error === null || typeof error !== 'object') return false
  return typeof (error as Record<string, unknown>).code === 'string'
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
    const appCode = AUTH_JWT_CODES.has(error.code)
      ? 'AUTH_UNAUTHORIZED'
      : AUTH_PERMISSION_CODES.has(error.code)
        ? 'AUTH_FORBIDDEN'
        : null
    if (appCode) {
      const appError = new AppError(appCode, {
        details: { pg_code: error.code, pg_details: error.details },
        cause: error,
      })
      logError(appError)
      const body = appError.toResponse()
      body.message = getErrorMessage(appCode, locale)
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
