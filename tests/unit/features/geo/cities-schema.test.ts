import { describe, it, expect } from 'vitest'
import { citySearchSchema } from '@/features/geo/schemas'

describe('citySearchSchema', () => {
  it('accepts valid query', () => {
    const result = citySearchSchema.safeParse({ q: 'Москва' })
    expect(result.success).toBe(true)
  })

  it('accepts query with country filter', () => {
    const result = citySearchSchema.safeParse({ q: 'Москва', country: 'RU' })
    expect(result.success).toBe(true)
  })

  it('rejects empty query', () => {
    const result = citySearchSchema.safeParse({ q: '' })
    expect(result.success).toBe(false)
  })

  it('rejects query longer than 100 chars', () => {
    const result = citySearchSchema.safeParse({ q: 'A'.repeat(101) })
    expect(result.success).toBe(false)
  })

  it('rejects invalid country code length', () => {
    const result = citySearchSchema.safeParse({ q: 'Лондон', country: 'GBR' })
    expect(result.success).toBe(false)
  })

  it('accepts when country is omitted', () => {
    const result = citySearchSchema.safeParse({ q: 'Казань' })
    expect(result.success).toBe(true)
  })
})
