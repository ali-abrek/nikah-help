import { describe, it, expect } from 'vitest'
import {
  buildProfileTitle,
  buildGenericTitle,
  buildProfileMetaDescription,
} from '@/lib/seo/metadata'

function computeAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const now = Date.now()
  const birth = new Date(birthDate).getTime()
  return Math.floor((now - birth) / (365.25 * 24 * 60 * 60 * 1000))
}

// Dynamic age — test expectations don't rot
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

const maleProfile = {
  name: 'Али',
  gender: 'male' as const,
  birth_date: '1993-03-15',
  country: 'Россия',
  city: 'Краснодар',
}

const femaleProfile = {
  name: 'Амина',
  gender: 'female' as const,
  birth_date: '2003-07-21',
  country: 'Узбекистан',
  city: 'Ташкент',
}

describe('buildProfileTitle', () => {
  it('builds Russian title for male profile', () => {
    const title = buildProfileTitle(maleProfile, 'ru')
    expect(title).toBe(
      `Мусульманин Али, ${maleAge} ${ruYearsWord(maleAge!)}, Краснодар, Россия — ищет мусульманку для никах | Nikah Help`,
    )
  })

  it('builds Russian title for female profile', () => {
    const title = buildProfileTitle(femaleProfile, 'ru')
    expect(title).toBe(
      `Мусульманка Амина, ${femaleAge} ${ruYearsWord(femaleAge!)}, Ташкент, Узбекистан — ищет мусульманина для никах | Nikah Help`,
    )
  })

  it('builds English title for male profile', () => {
    const title = buildProfileTitle({ ...maleProfile, country: 'Russia', city: 'Krasnodar' }, 'en')
    expect(title).toBe(
      `Muslim man Али, ${maleAge}, Krasnodar, Russia — looking for a Muslim woman for nikah | Nikah Help`,
    )
  })

  it('builds English title for female profile', () => {
    const title = buildProfileTitle(
      { ...femaleProfile, country: 'Uzbekistan', city: 'Tashkent' },
      'en',
    )
    expect(title).toBe(
      `Muslim woman Амина, ${femaleAge}, Tashkent, Uzbekistan — looking for a Muslim man for nikah | Nikah Help`,
    )
  })

  it('handles missing name', () => {
    const title = buildProfileTitle({ ...maleProfile, name: null }, 'ru')
    expect(title).toContain('Мусульманин')
    expect(title).not.toContain('Али')
  })

  it('handles missing city', () => {
    const title = buildProfileTitle({ ...maleProfile, city: null }, 'ru')
    expect(title).toContain('Россия')
    expect(title).not.toContain('Краснодар')
  })
})

describe('buildGenericTitle', () => {
  it('builds generic page title in Russian', () => {
    expect(buildGenericTitle('Настройки', 'ru')).toBe(
      'Настройки | Знакомства мусульман для никах | Nikah Help',
    )
  })

  it('builds generic page title in English', () => {
    expect(buildGenericTitle('Settings', 'en')).toBe('Settings | Muslim Nikah Dating | Nikah Help')
  })
})

describe('buildProfileMetaDescription', () => {
  it('returns stored meta_description if available', () => {
    const desc = buildProfileMetaDescription(
      { meta_description: 'Али, 32 года. Соблюдающий мусульманин.' },
      'ru',
    )
    expect(desc).toBe('Али, 32 года. Соблюдающий мусульманин.')
  })

  it('falls back to ai_bio if no meta_description', () => {
    const desc = buildProfileMetaDescription(
      { ai_bio: 'Я Али, из Краснодара. Ищу жену для никах.' },
      'ru',
    )
    expect(desc).toBe('Я Али, из Краснодара. Ищу жену для никах.')
  })

  it('falls back to template-based description when neither exists', () => {
    const desc = buildProfileMetaDescription(
      {
        name: 'Али',
        age: 32,
        city: 'Краснодар',
        country: 'Россия',
        gender: 'male',
      },
      'ru',
    )
    expect(desc).toContain('Али')
    expect(desc).toContain('Краснодар')
    expect(desc).toContain('никах')
  })

  it('truncates to 300 characters', () => {
    const longBio = 'a'.repeat(500)
    const desc = buildProfileMetaDescription({ ai_bio: longBio }, 'en')
    expect(desc.length).toBeLessThanOrEqual(300)
  })
})
