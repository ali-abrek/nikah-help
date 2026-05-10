import type { ErrorResponse } from './types'
import { getErrorMessage } from './messages'

export async function parseApiError(
  response: Response,
  locale: 'ru' | 'en' = 'ru',
): Promise<ErrorResponse> {
  try {
    const body = await response.json()
    if (body && typeof body.code === 'string') {
      return body as ErrorResponse
    }
  } catch {
    // Response is not JSON (e.g., HTML error page)
  }

  return {
    code: 'SYSTEM_INTERNAL_ERROR',
    message: getErrorMessage('SYSTEM_INTERNAL_ERROR', locale),
    trace_id: 'unknown',
    status: response.status,
  }
}

export function getActionError(result: { success: false; error: ErrorResponse }): ErrorResponse {
  return result.error
}
