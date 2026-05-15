import { SITE_NAME, BRAND_SEPARATOR, NIKAH_INVARIANT_RU, NIKAH_INVARIANT_EN } from './constants'
import type { Lang } from '@/lib/i18n/dictionary'

interface ProfileSeoData {
  name: string | null
  gender: string | null
  birth_date: string | null
  country: string | null
  city: string | null
  ai_bio?: string | null
  meta_description?: string | null
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

function cityOrCountry(city: string | null, country: string | null): string {
  const parts: string[] = []
  if (city) parts.push(city)
  if (country) parts.push(country)
  return parts.join(', ')
}

/**
 * Builds the <title> for a profile page.
 * Format differs by gender and locale. The word "никах" is preserved immutable.
 */
export function buildProfileTitle(profile: ProfileSeoData, lang: Lang): string {
  const age = computeAge(profile.birth_date)
  const location = cityOrCountry(profile.city, profile.country)
  const name = profile.name ?? ''

  if (lang === 'ru') {
    const genderLabel = profile.gender === 'female' ? 'Мусульманка' : 'Мусульманин'
    const lookingFor =
      profile.gender === 'female'
        ? NIKAH_INVARIANT_RU.femaleLookingFor
        : NIKAH_INVARIANT_RU.maleLookingFor

    let main = genderLabel
    if (name) main += ` ${name}`
    if (age !== null) main += `, ${age} ${ruYearsWord(age)}`
    if (location) main += `, ${location}`
    main += ` — ${lookingFor}`

    return `${main} ${BRAND_SEPARATOR} ${SITE_NAME}`
  }

  // English
  const genderLabel = profile.gender === 'female' ? 'Muslim woman' : 'Muslim man'
  const lookingFor =
    profile.gender === 'female'
      ? NIKAH_INVARIANT_EN.femaleLookingFor
      : NIKAH_INVARIANT_EN.maleLookingFor

  let main = genderLabel
  if (name) main += ` ${name}`
  if (age !== null) main += `, ${age}`
  if (location) main += `, ${location}`
  main += ` — ${lookingFor}`

  return `${main} ${BRAND_SEPARATOR} ${SITE_NAME}`
}

/**
 * Builds a generic page title: "<Page Name> | Muslim Nikah Dating | Nikah Help"
 */
export function buildGenericTitle(pageName: string, lang: Lang): string {
  const tagline =
    lang === 'ru' ? NIKAH_INVARIANT_RU.muslimNikahDating : NIKAH_INVARIANT_EN.muslimNikahDating
  return `${pageName} ${BRAND_SEPARATOR} ${tagline} ${BRAND_SEPARATOR} ${SITE_NAME}`
}

/**
 * Builds the meta description for a profile page.
 * Prefers stored meta_description > ai_bio > template fallback.
 * Truncates to 300 characters.
 */
export function buildProfileMetaDescription(profile: Record<string, unknown>, lang: Lang): string {
  const MAX_LENGTH = 300

  // Best: dedicated meta description generated alongside AI bio
  if (typeof profile.meta_description === 'string' && profile.meta_description.trim()) {
    return profile.meta_description.trim().slice(0, MAX_LENGTH)
  }

  // Good: AI bio as fallback
  if (typeof profile.ai_bio === 'string' && profile.ai_bio.trim()) {
    return profile.ai_bio.trim().slice(0, MAX_LENGTH)
  }

  // Minimal: template from available fields
  const name = typeof profile.name === 'string' ? profile.name : ''
  const city = typeof profile.city === 'string' ? profile.city : ''
  const country = typeof profile.country === 'string' ? profile.country : ''
  const gender = typeof profile.gender === 'string' ? profile.gender : ''
  const age = computeAge(typeof profile.birth_date === 'string' ? profile.birth_date : null)

  if (lang === 'ru') {
    const locationParts = [city, country].filter(Boolean).join(', ')
    const lookFor =
      gender === 'female' ? NIKAH_INVARIANT_RU.femaleLookingFor : NIKAH_INVARIANT_RU.maleLookingFor

    let desc = ''
    if (name) desc += `${name}`
    if (age !== null) desc += `, ${age} ${ruYearsWord(age)}`
    if (locationParts) desc += `, ${locationParts}`
    desc += `. ${lookFor}`
    return desc.slice(0, MAX_LENGTH)
  }

  // English fallback
  const locationParts = [city, country].filter(Boolean).join(', ')
  const lookFor =
    gender === 'female' ? NIKAH_INVARIANT_EN.femaleLookingFor : NIKAH_INVARIANT_EN.maleLookingFor

  let desc = ''
  if (name) desc += `${name}`
  if (age !== null) desc += `, ${age}`
  if (locationParts) desc += `, ${locationParts}`
  desc += `. ${lookFor}`
  return desc.slice(0, MAX_LENGTH)
}
