interface JsonLdProfile {
  id: string
  name: string | null
  gender: string | null
  city: string | null
  country: string | null
  birth_date: string | null
}

/**
 * Builds schema.org JSON-LD structured data for a profile page.
 * Uses Person type with homeLocation.
 */
export function buildProfileJsonLd(profile: JsonLdProfile, siteUrl: string): string {
  const person: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    url: `${siteUrl}/profile/${profile.id}`,
  }

  if (profile.name) {
    person.name = profile.name
  }

  if (profile.gender) {
    person.gender = profile.gender === 'female' ? 'Female' : 'Male'
  }

  if (profile.city || profile.country) {
    const locationParts = [profile.city, profile.country].filter(Boolean)
    person.homeLocation = {
      '@type': 'Place',
      name: locationParts.join(', '),
    }
  }

  return JSON.stringify(person)
}
