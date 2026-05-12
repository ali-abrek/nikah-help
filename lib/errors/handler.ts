import { AppError } from './app-error'
import { NextResponse } from 'next/server'
import type { ErrorResponse } from './types'
import { logError } from './logger'
import { getErrorMessage } from './messages'

const AUTH_POSTGREST_CODES = new Set(['42501', 'PGRST301', 'PGRST102', 'PGRST104'])
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
    if (AUTH_POSTGREST_CODES.has(error.code)) {
      const appError = new AppError('AUTH_UNAUTHORIZED', {
        details: { pg_code: error.code, pg_details: error.details },
        cause: error,
      })
      logError(appError)
      const body = appError.toResponse()
      body.message = getErrorMessage('AUTH_UNAUTHORIZED', locale)
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
