import { AppError } from './app-error'
import { NextResponse } from 'next/server'
import type { ErrorResponse } from './types'
import { logError } from './logger'
import { getErrorMessage } from './messages'

// JWT-level codes → AUTH_UNAUTHORIZED (401). Privilege-level codes (RLS,
// missing GRANT) → AUTH_FORBIDDEN (403). Keeping these separate prevents
// a database permission issue from masquerading as a session problem.
const AUTH_JWT_CODES = new Set(['PGRST102', 'PGRST104'])
const AUTH_PERMISSION_CODES = new Set(['42501', 'PGRST301'])
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

export function handleRouteError(
  error: unknown,
  locale: 'ru' | 'en' = 'ru',
): NextResponse<ErrorResponse> {
  if (error instanceof AppError) {
    logError(error)
    const body = error.toResponse()
    if (body.message === error.code) {
      body.message = getErrorMessage(error.code, locale)
    }
    return NextResponse.json(body, { status: error.status })
  }

  if (isPostgrestError(error)) {
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
      return NextResponse.json(body, { status: appError.status })
    }

    if (VALIDATION_POSTGREST_CODES.has(error.code)) {
      const appError = new AppError('VALIDATION_INVALID_INPUT', {
        details: { pg_code: error.code, pg_details: error.details },
        cause: error,
      })
      logError(appError)
      const body = appError.toResponse()
      body.message = getErrorMessage('VALIDATION_INVALID_INPUT', locale)
      return NextResponse.json(body, { status: appError.status })
    }
  }

  const internal = new AppError('SYSTEM_INTERNAL_ERROR', {
    cause: error instanceof Error ? error : undefined,
  })
  logError(internal)
  const body = internal.toResponse()
  body.message = getErrorMessage('SYSTEM_INTERNAL_ERROR', locale)
  return NextResponse.json(body, { status: 500 })
}
