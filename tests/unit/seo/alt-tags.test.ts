import { describe, it, expect } from 'vitest'
import { buildImageAltTag } from '@/lib/seo/alt-tags'

function computeAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const now = Date.now()
  const birth = new Date(birthDate).getTime()
  return Math.floor((now - birth) / (365.25 * 24 * 60 * 60 * 1000))
}

const maleAge = computeAge('1993-03-15')
const femaleAge = computeAge('2003-07-21')

function ruYearsWord(age: number): string {
  const lastDigit = age % 10
  const lastTwo = age % 100
  if (lastTwo >= 11 && lastTwo <= 19) return 'лет'
  if (lastDigit === 1) return 'год'
  if (lastDigit >= 2 && lastDigit <= 4) return 'года'
  return 'лет'
}

describe('buildImageAltTag', () => {
  it('builds Russian alt tag for male user', () => {
    const alt = buildImageAltTag(
      { name: 'Али', gender: 'male', city: 'Москва', country: 'Россия', birth_date: '1993-03-15' },
      'ru',
    )
    expect(alt).toBe(
      `Али, ${maleAge} ${ruYearsWord(maleAge!)}, Москва, Россия. Мусульманин ищет мусульманку для никах.`,
    )
  })

  it('builds Russian alt tag for female user', () => {
    const alt = buildImageAltTag(
      {
        name: 'Амина',
        gender: 'female',
        city: 'Ташкент',
        country: 'Узбекистан',
        birth_date: '2003-07-21',
      },
      'ru',
    )
    expect(alt).toBe(
      `Амина, ${femaleAge} ${ruYearsWord(femaleAge!)}, Ташкент, Узбекистан. Мусульманка ищет мусульманина для никах.`,
    )
  })

  it('builds English alt tag for male user', () => {
    const alt = buildImageAltTag(
      { name: 'Ali', gender: 'male', city: 'Moscow', country: 'Russia', birth_date: '1993-03-15' },
      'en',
    )
    expect(alt).toBe(
      `Ali, ${maleAge}, Moscow, Russia. Muslim man looking for a Muslim woman for nikah.`,
    )
  })

  it('handles missing optional fields gracefully', () => {
    const alt = buildImageAltTag(
      { name: null, gender: 'male', city: null, country: 'Россия', birth_date: null },
      'ru',
    )
    expect(alt).toContain('Мусульманин')
    expect(alt).toContain('Россия')
    expect(alt).toContain('никах')
  })

  it('preserves "никах" in immutable form for all genders', () => {
    const maleAlt = buildImageAltTag(
      { name: 'Test', gender: 'male', city: 'Test', country: 'Test', birth_date: '2000-01-01' },
      'ru',
    )
    const femaleAlt = buildImageAltTag(
      { name: 'Test', gender: 'female', city: 'Test', country: 'Test', birth_date: '2000-01-01' },
      'ru',
    )
    expect(maleAlt).toContain('никах')
    expect(femaleAlt).toContain('никах')
    expect(maleAlt).not.toContain('никаха')
    expect(femaleAlt).not.toContain('никаха')
  })
})
