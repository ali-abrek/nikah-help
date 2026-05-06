import { describe, it, expect } from 'vitest'
import { emailSchema } from '@/features/auth/schemas'

describe('emailSchema', () => {
  it('accepts valid email', () => {
    const result = emailSchema.safeParse({ email: 'user@example.com' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = emailSchema.safeParse({ email: 'not-an-email' })
    expect(result.success).toBe(false)
  })

  it('rejects empty string', () => {
    const result = emailSchema.safeParse({ email: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing email field', () => {
    const result = emailSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
