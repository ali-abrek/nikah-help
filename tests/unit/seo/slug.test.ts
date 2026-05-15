import { describe, it, expect } from 'vitest'
import { generateSeoSlug } from '@/lib/seo/slug'

const maleProfile = {
  gender: 'male' as const,
  country: 'Russia',
  city: 'Moscow',
}

const femaleProfile = {
  gender: 'female' as const,
  country: 'Uzbekistan',
  city: 'Tashkent',
}

describe('generateSeoSlug', () => {
  it('generates slug for male user', () => {
    expect(generateSeoSlug(maleProfile)).toBe('nikah-muslim-moscow-russia')
  })

  it('generates slug for female user', () => {
    expect(generateSeoSlug(femaleProfile)).toBe('nikah-muslima-tashkent-uzbekistan')
  })

  it('uses "muslim" for male gender', () => {
    const slug = generateSeoSlug({ gender: 'male', country: 'Kazakhstan', city: 'Almaty' })
    expect(slug).toContain('muslim')
  })

  it('uses "muslima" for female gender', () => {
    const slug = generateSeoSlug({ gender: 'female', country: 'Russia', city: 'Kazan' })
    expect(slug).toContain('muslima')
  })

  it('transliterates Cyrillic city and country', () => {
    const slug = generateSeoSlug({ gender: 'male', country: 'Россия', city: 'Москва' })
    expect(slug).toBe('nikah-muslim-moskva-rossiya')
  })

  it('handles null city gracefully', () => {
    const slug = generateSeoSlug({ gender: 'male', country: 'Russia', city: null })
    expect(slug).toBe('nikah-muslim-russia')
  })

  it('handles null country gracefully', () => {
    const slug = generateSeoSlug({ gender: 'male', country: null, city: 'Moscow' })
    expect(slug).toBe('nikah-muslim-moscow')
  })

  it('handles both null gracefully', () => {
    const slug = generateSeoSlug({ gender: 'female', country: null, city: null })
    expect(slug).toBe('nikah-muslima')
  })

  it('produces lowercase output', () => {
    const slug = generateSeoSlug({ gender: 'male', country: 'RUSSIA', city: 'MOSCOW' })
    expect(slug).toBe(slug.toLowerCase())
  })

  it('has no special characters', () => {
    const slug = generateSeoSlug({ gender: 'female', country: 'Russia', city: 'Rostov-on-Don' })
    expect(slug).not.toMatch(/[^a-z0-9-]/)
  })

  it('preserves "nikah" immutable form at the start', () => {
    const slug = generateSeoSlug(maleProfile)
    expect(slug.startsWith('nikah-')).toBe(true)
  })
})
