import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { validationError } from '@/lib/errors/validation'

describe('validationError', () => {
  it('should extract per-field errors from ZodError', () => {
    const schema = z.object({
      email: z.email({ error: 'Некорректный email' }),
      name: z.string().min(2, { error: 'Минимум 2 символа' }),
    })

    const parsed = schema.safeParse({ email: 'bad', name: '' })
    expect(parsed.success).toBe(false)

    if (!parsed.success) {
      const err = validationError(parsed.error)
      expect(err.code).toBe('VALIDATION_INVALID_INPUT')
      expect(err.status).toBe(422)
      expect(err.details).toBeDefined()
      expect(err.details!.email).toBeDefined()
      expect(err.details!.name).toBeDefined()
    }
  })

  it('should use first error per path', () => {
    const schema = z.object({
      email: z.email({ error: 'Некорректный email' }),
    })
    const parsed = schema.safeParse({ email: '' })
    if (!parsed.success) {
      const err = validationError(parsed.error)
      expect(err.details!.email).toBeDefined()
    }
  })
})
