import { AppError } from './app-error'
import { NextResponse } from 'next/server'
import type { ErrorResponse } from './types'
import { logError } from './logger'
import { getErrorMessage } from './messages'

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

  const internal = new AppError('SYSTEM_INTERNAL_ERROR', {
    cause: error instanceof Error ? error : undefined,
  })
  logError(internal)
  const body = internal.toResponse()
  body.message = getErrorMessage('SYSTEM_INTERNAL_ERROR', locale)
  return NextResponse.json(body, { status: 500 })
}
