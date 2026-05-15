import { describe, it, expect } from 'vitest'
import { buildProfileJsonLd } from '@/lib/seo/structured-data'

describe('buildProfileJsonLd', () => {
  const profile = {
    id: 'a895e215-96c9-4f2e-a6ee-6eaacc1fe5da',
    name: 'Али',
    gender: 'male' as const,
    city: 'Москва',
    country: 'Россия',
    birth_date: '1993-03-15',
  }

  it('returns a valid JSON-LD Person object', () => {
    const result = buildProfileJsonLd(profile, 'https://nikahhelp.com')
    const parsed = JSON.parse(result)
    expect(parsed['@context']).toBe('https://schema.org')
    expect(parsed['@type']).toBe('Person')
  })

  it('includes name when available', () => {
    const result = buildProfileJsonLd(profile, 'https://nikahhelp.com')
    expect(result).toContain('"name":"Али"')
  })

  it('maps gender correctly', () => {
    const male = buildProfileJsonLd(profile, 'https://nikahhelp.com')
    expect(male).toContain('"gender":"Male"')

    const female = buildProfileJsonLd({ ...profile, gender: 'female' as const }, 'https://nikahhelp.com')
    expect(female).toContain('"gender":"Female"')
  })

  it('includes homeLocation', () => {
    const result = buildProfileJsonLd(profile, 'https://nikahhelp.com')
    expect(result).toContain('"homeLocation"')
    expect(result).toContain('Москва')
  })

  it('omits null fields', () => {
    const result = buildProfileJsonLd(
      { id: '123', name: null, gender: null, city: null, country: null, birth_date: null },
      'https://nikahhelp.com',
    )
    expect(result).not.toContain('"name":null')
    expect(result).not.toContain('"gender":null')
    expect(result).not.toContain('"homeLocation":null')
  })

  it('includes url', () => {
    const result = buildProfileJsonLd(profile, 'https://nikahhelp.com')
    expect(result).toContain('"url":"https://nikahhelp.com/profile/a895e215-96c9-4f2e-a6ee-6eaacc1fe5da')
  })
})
