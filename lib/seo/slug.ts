import { cyrillicToLatin } from './transliterate'

interface SeoSlugInput {
  gender: string | null
  country: string | null
  city: string | null
}

/**
 * Generates an SEO-friendly URL slug from profile data.
 * Format: nikah-<muslim|muslima>-<city>-<country>
 *
 * The word "nikah" is preserved in its immutable form.
 * All components are transliterated from Cyrillic to Latin if needed.
 *
 * Used for: profile URLs, image SEO URLs, canonical URLs, sitemap, metadata.
 */
export function generateSeoSlug(profile: SeoSlugInput): string {
  const genderSlug = profile.gender === 'female' ? 'muslima' : 'muslim'
  const parts = ['nikah', genderSlug]

  if (profile.city) {
    parts.push(cyrillicToLatin(profile.city))
  }
  if (profile.country) {
    parts.push(cyrillicToLatin(profile.country))
  }

  return parts.join('-').toLowerCase()
}
