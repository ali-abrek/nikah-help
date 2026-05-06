import { ZodError } from 'zod'
import { AppError } from './app-error'

export function validationError(zodError: ZodError): AppError {
  const details: Record<string, string> = {}
  for (const issue of zodError.issues) {
    const path = issue.path.join('.')
    if (!details[path]) {
      details[path] = issue.message
    }
  }
  return new AppError('VALIDATION_INVALID_INPUT', { details })
}
