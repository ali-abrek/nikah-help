export const SITE_NAME = 'Nikah Help'
export const BRAND_SEPARATOR = '|'

/**
 * The Russian word "никах" must NEVER be declined or grammatically modified.
 * These phrases are the single source of truth for all SEO text generation.
 *
 * Correct forms:
 *   для никах
 *   ищет мусульманку для никах
 *   ищет мусульманина для никах
 *   знакомства для никах
 *
 * Incorrect forms that must NEVER appear:
 *   для никаха
 *   для никаху
 *   для никахе
 */
export const NIKAH_INVARIANT_RU = {
  /** "ищет мусульманку для никах" */
  maleLookingFor: 'ищет мусульманку для никах',
  /** "ищет мусульманина для никах" */
  femaleLookingFor: 'ищет мусульманина для никах',
  /** "для никах" */
  forNikah: 'для никах',
  /** "знакомства для никах" */
  datingForNikah: 'знакомства для никах',
  /** "Muslim Nikah Dating" (used in Russian generic page titles) */
  muslimNikahDating: 'Знакомства мусульман для никах',
} as const

export const NIKAH_INVARIANT_EN = {
  maleLookingFor: 'looking for a Muslim woman for nikah',
  femaleLookingFor: 'looking for a Muslim man for nikah',
  forNikah: 'for nikah',
  datingForNikah: 'Muslim matchmaking for nikah',
  muslimNikahDating: 'Muslim Nikah Dating',
} as const
