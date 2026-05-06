import { AppError } from './app-error'
import type { ErrorResponse } from './types'
import { logError } from './logger'
import { getErrorMessage } from './messages'

export type ServerActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: ErrorResponse }

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

  const internal = new AppError('SYSTEM_INTERNAL_ERROR', {
    cause: error instanceof Error ? error : undefined,
  })
  logError(internal)
  const body = internal.toResponse()
  body.message = getErrorMessage('SYSTEM_INTERNAL_ERROR', locale)
  return { success: false, error: body }
}
