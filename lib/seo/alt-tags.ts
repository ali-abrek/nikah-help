import { NIKAH_INVARIANT_RU, NIKAH_INVARIANT_EN } from './constants'
import type { Lang } from '@/lib/i18n/dictionary'

interface AltTagInput {
  name: string | null
  gender: string | null
  city: string | null
  country: string | null
  birth_date: string | null
}

function computeAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const now = Date.now()
  const birth = new Date(birthDate).getTime()
  return Math.floor((now - birth) / (365.25 * 24 * 60 * 60 * 1000))
}

function ruYearsWord(age: number): string {
  const lastDigit = age % 10
  const lastTwo = age % 100
  if (lastTwo >= 11 && lastTwo <= 19) return 'лет'
  if (lastDigit === 1) return 'год'
  if (lastDigit >= 2 && lastDigit <= 4) return 'года'
  return 'лет'
}

/**
 * Builds a natural, SEO-friendly alt tag for a user profile image.
 * Formula differs by gender and locale. The word "никах" is preserved immutable.
 *
 * Male RU:   "<name>, <age>, <city>, <country>. Мусульманин ищет мусульманку для никах."
 * Female RU: "<name>, <age>, <city>, <country>. Мусульманка ищет мусульманина для никах."
 * Male EN:   "<name>, <age>, <city>, <country>. Muslim man looking for a Muslim woman for nikah."
 * Female EN: "<name>, <age>, <city>, <country>. Muslim woman looking for a Muslim man for nikah."
 */
export function buildImageAltTag(profile: AltTagInput, lang: Lang): string {
  const age = computeAge(profile.birth_date)

  if (lang === 'ru') {
    const parts: string[] = []
    if (profile.name) parts.push(profile.name)
    if (age !== null) parts.push(`${age} ${ruYearsWord(age)}`)
    if (profile.city) parts.push(profile.city)
    if (profile.country) parts.push(profile.country)

    const prefix = parts.join(', ')
    const suffix =
      profile.gender === 'female'
        ? `Мусульманка ${NIKAH_INVARIANT_RU.femaleLookingFor}`
        : `Мусульманин ${NIKAH_INVARIANT_RU.maleLookingFor}`

    return `${prefix}. ${suffix}.`
  }

  // English
  const parts: string[] = []
  if (profile.name) parts.push(profile.name)
  if (age !== null) parts.push(String(age))
  if (profile.city) parts.push(profile.city)
  if (profile.country) parts.push(profile.country)

  const prefix = parts.join(', ')
  const suffix =
    profile.gender === 'female'
      ? `Muslim woman ${NIKAH_INVARIANT_EN.femaleLookingFor}`
      : `Muslim man ${NIKAH_INVARIANT_EN.maleLookingFor}`

  return `${prefix}. ${suffix}.`
}
