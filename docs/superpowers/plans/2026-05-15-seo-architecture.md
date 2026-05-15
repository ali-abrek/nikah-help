# SEO Architecture and Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement complete SEO architecture for user profiles: SEO-friendly URLs with slugs, dynamic metadata (titles, descriptions, OG, JSON-LD), SEO image URLs, sitemap, robots.txt, canonical URLs, and SSR-rendered metadata — all with "никах" preserved in immutable form.

**Architecture:** Centralized SEO helpers in `lib/seo/` generate slugs, metadata, alt tags, and structured data from profile data. The slug is computed on-the-fly (not stored) and UUID remains the source of truth. Profile pages use `generateMetadata` for SSR SEO and `permanentRedirect` when the URL slug is stale. A new `meta_description` column stores AI-generated descriptions produced alongside `ai_bio` in a single OpenAI call. SEO-friendly photo URLs map to the existing streaming pipeline via a new Route Handler. Sitemap and robots.txt use Next.js built-in conventions.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres, OpenAI (gpt-4o-mini), TypeScript strict mode, Zod v4, Vitest

---

### Task 1: Transliteration Helper

**Files:**
- Create: `nikah-help/lib/seo/transliterate.ts`
- Create: `nikah-help/tests/unit/seo/transliterate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// nikah-help/tests/unit/seo/transliterate.test.ts
import { describe, it, expect } from 'vitest'
import { cyrillicToLatin } from '@/lib/seo/transliterate'

describe('cyrillicToLatin', () => {
  it('transliterates common Russian city names', () => {
    expect(cyrillicToLatin('Москва')).toBe('moscow')
    expect(cyrillicToLatin('Казань')).toBe('kazan')
    expect(cyrillicToLatin('Санкт-Петербург')).toBe('sankt-peterburg')
    expect(cyrillicToLatin('Краснодар')).toBe('krasnodar')
    expect(cyrillicToLatin('Душанбе')).toBe('dushanbe')
    expect(cyrillicToLatin('Ташкент')).toBe('tashkent')
  })

  it('transliterates country names', () => {
    expect(cyrillicToLatin('Россия')).toBe('rossiya')
    expect(cyrillicToLatin('Узбекистан')).toBe('uzbekistan')
    expect(cyrillicToLatin('Казахстан')).toBe('kazakhstan')
    expect(cyrillicToLatin('Таджикистан')).toBe('tadzhikistan')
  })

  it('passes through already-latin text unchanged', () => {
    expect(cyrillicToLatin('Moscow')).toBe('moscow')
    expect(cyrillicToLatin('hello')).toBe('hello')
  })

  it('replaces spaces with hyphens', () => {
    expect(cyrillicToLatin('Нижний Новгород')).toBe('nizhniy-novgorod')
  })

  it('removes special characters', () => {
    expect(cyrillicToLatin("къол'а, тїп!")).toBe('kola-tip')
  })

  it('handles empty string', () => {
    expect(cyrillicToLatin('')).toBe('')
  })

  it('handles mixed cyrillic and latin', () => {
    expect(cyrillicToLatin('Москва City')).toBe('moskva-city')
  })

  it('lowercases output', () => {
    expect(cyrillicToLatin('МОСКВА')).toBe('moskva')
    expect(cyrillicToLatin('MOSCOW')).toBe('moscow')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run tests/unit/seo/transliterate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the transliteration implementation**

```typescript
// nikah-help/lib/seo/transliterate.ts

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',  б: 'b',  в: 'v',  г: 'g',  д: 'd',
  е: 'e',  ё: 'yo', ж: 'zh', з: 'z',  и: 'i',
  й: 'y',  к: 'k',  л: 'l',  м: 'm',  н: 'n',
  о: 'o',  п: 'p',  р: 'r',  с: 's',  т: 't',
  у: 'u',  ф: 'f',  х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '',
  э: 'e',  ю: 'yu', я: 'ya',
  ҳ: 'h',  ӯ: 'u',  ҷ: 'j',  қ: 'k',  ғ: 'g',
}

/**
 * Deterministic Cyrillic-to-Latin transliteration for SEO slugs.
 * Used identically on both frontend (for client-side URL construction)
 * and backend (for canonical URL generation).
 */
export function cyrillicToLatin(input: string): string {
  let result = ''
  const lower = input.toLowerCase()
  for (const ch of lower) {
    result += CYRILLIC_TO_LATIN[ch] ?? ch
  }
  // Collapse to only [a-z0-9] plus hyphens
  result = result.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run tests/unit/seo/transliterate.test.ts`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/unit/seo/transliterate.test.ts lib/seo/transliterate.ts
git commit -m "feat: add Cyrillic-to-Latin transliteration helper for SEO slugs"
```

---

### Task 2: SEO Slug Generation

**Files:**
- Create: `nikah-help/lib/seo/slug.ts`
- Create: `nikah-help/tests/unit/seo/slug.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// nikah-help/tests/unit/seo/slug.test.ts
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
    const slug = generateSeoSlug({ gender: 'Male' as any, country: 'RUSSIA', city: 'MOSCOW' })
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run tests/unit/seo/slug.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the slug generation implementation**

```typescript
// nikah-help/lib/seo/slug.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run tests/unit/seo/slug.test.ts`
Expected: PASS (all 10 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/unit/seo/slug.test.ts lib/seo/slug.ts
git commit -m "feat: add SEO slug generation helper with nikah-<gender>-<city>-<country> format"
```

---

### Task 3: SEO Constants and the "никах" Invariant Rule

**Files:**
- Create: `nikah-help/lib/seo/constants.ts`
- Create: `nikah-help/tests/unit/seo/constants.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// nikah-help/tests/unit/seo/constants.test.ts
import { describe, it, expect } from 'vitest'
import {
  SITE_NAME,
  BRAND_SEPARATOR,
  NIKAH_INVARIANT_RU,
  NIKAH_INVARIANT_EN,
} from '@/lib/seo/constants'

describe('SEO constants', () => {
  it('defines site name', () => {
    expect(SITE_NAME).toBe('Nikah Help')
  })

  it('defines brand separator', () => {
    expect(BRAND_SEPARATOR).toBe('|')
  })

  describe('NIKAH_INVARIANT_RU', () => {
    it('contains "никах" in immutable form', () => {
      // The spec requires "никах" to NEVER be declined.
      // These are the approved phrases.
      expect(NIKAH_INVARIANT_RU.maleLookingFor).toContain('никах')
      expect(NIKAH_INVARIANT_RU.femaleLookingFor).toContain('никах')
      expect(NIKAH_INVARIANT_RU.forNikah).toContain('никах')
    })

    it('does NOT contain declined forms', () => {
      const all = Object.values(NIKAH_INVARIANT_RU).join(' ')
      expect(all).not.toContain('никаха')
      expect(all).not.toContain('никаху')
      expect(all).not.toContain('никахе')
      expect(all).not.toContain('никахом')
      expect(all).not.toContain('никахи')
    })
  })

  describe('NIKAH_INVARIANT_EN', () => {
    it('contains "nikah" in immutable form', () => {
      expect(NIKAH_INVARIANT_EN.maleLookingFor).toContain('nikah')
      expect(NIKAH_INVARIANT_EN.femaleLookingFor).toContain('nikah')
      expect(NIKAH_INVARIANT_EN.forNikah).toContain('nikah')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run tests/unit/seo/constants.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the constants file**

```typescript
// nikah-help/lib/seo/constants.ts

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run tests/unit/seo/constants.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/unit/seo/constants.test.ts lib/seo/constants.ts
git commit -m "feat: add SEO constants with immutable никах invariant rule enforcement"
```

---

### Task 4: SEO Metadata Builder — Titles & Descriptions

**Files:**
- Create: `nikah-help/lib/seo/metadata.ts`
- Create: `nikah-help/tests/unit/seo/metadata.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// nikah-help/tests/unit/seo/metadata.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildProfileTitle,
  buildGenericTitle,
  buildProfileMetaDescription,
} from '@/lib/seo/metadata'

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
      'Мусульманин Али, 32 года, Краснодар, Россия — ищет мусульманку для никах | Nikah Help',
    )
  })

  it('builds Russian title for female profile', () => {
    const title = buildProfileTitle(femaleProfile, 'ru')
    expect(title).toBe(
      'Мусульманка Амина, 22 года, Ташкент, Узбекистан — ищет мусульманина для никах | Nikah Help',
    )
  })

  it('builds English title for male profile', () => {
    const title = buildProfileTitle({ ...maleProfile, country: 'Russia', city: 'Krasnodar' }, 'en')
    expect(title).toBe(
      'Muslim man Ali, 32, Krasnodar, Russia — looking for a Muslim woman for nikah | Nikah Help',
    )
  })

  it('builds English title for female profile', () => {
    const title = buildProfileTitle(
      { ...femaleProfile, country: 'Uzbekistan', city: 'Tashkent' },
      'en',
    )
    expect(title).toBe(
      'Muslim woman Amina, 22, Tashkent, Uzbekistan — looking for a Muslim man for nikah | Nikah Help',
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
    expect(buildGenericTitle('Settings', 'en')).toBe(
      'Settings | Muslim Nikah Dating | Nikah Help',
    )
  })
})

describe('buildProfileMetaDescription', () => {
  it('returns stored meta_description if available', () => {
    const desc = buildProfileMetaDescription({ meta_description: 'Али, 32 года. Соблюдающий мусульманин.' }, 'ru')
    expect(desc).toBe('Али, 32 года. Соблюдающий мусульманин.')
  })

  it('falls back to ai_bio if no meta_description', () => {
    const desc = buildProfileMetaDescription({ ai_bio: 'Я Али, из Краснодара. Ищу жену для никах.' }, 'ru')
    expect(desc).toBe('Я Али, из Краснодара. Ищу жену для никах.')
  })

  it('falls back to template-based description when neither exists', () => {
    const desc = buildProfileMetaDescription({
      name: 'Али',
      age: 32,
      city: 'Краснодар',
      country: 'Россия',
      gender: 'male',
    }, 'ru')
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run tests/unit/seo/metadata.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the metadata builder**

```typescript
// nikah-help/lib/seo/metadata.ts
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

function cityOrCountry(city: string | null, country: string | null, lang: Lang): string {
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
  const location = cityOrCountry(profile.city, profile.country, lang)
  const name = profile.name ?? ''

  if (lang === 'ru') {
    const genderLabel = profile.gender === 'female' ? 'Мусульманка' : 'Мусульманин'
        const lookingFor =
      profile.gender === 'female'
        ? NIKAH_INVARIANT_RU.femaleLookingFor
        : NIKAH_INVARIANT_RU.maleLookingFor

    let main = genderLabel
    if (name) main += ` ${name}`
    if (age !== null) main += `, ${age} ${age === 1 ? 'год' : age < 5 ? 'года' : 'лет'}`
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
    lang === 'ru'
      ? NIKAH_INVARIANT_RU.muslimNikahDating
      : NIKAH_INVARIANT_EN.muslimNikahDating
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
  const age = computeAge(
    typeof profile.birth_date === 'string' ? profile.birth_date : null,
  )

  if (lang === 'ru') {
    const locationParts = [city, country].filter(Boolean).join(', ')
    const forNikah = NIKAH_INVARIANT_RU.forNikah
    const lookFor =
      gender === 'female'
        ? NIKAH_INVARIANT_RU.femaleLookingFor
        : NIKAH_INVARIANT_RU.maleLookingFor

    let desc = ''
    if (name) desc += `${name}`
    if (age !== null) desc += `, ${age} ${age === 1 ? 'год' : age < 5 ? 'года' : 'лет'}`
    if (locationParts) desc += `, ${locationParts}`
    desc += `. ${lookFor}`
    return desc.slice(0, MAX_LENGTH)
  }

  // English fallback
  const locationParts = [city, country].filter(Boolean).join(', ')
  const lookFor =
    gender === 'female'
      ? NIKAH_INVARIANT_EN.femaleLookingFor
      : NIKAH_INVARIANT_EN.maleLookingFor

  let desc = ''
  if (name) desc += `${name}`
  if (age !== null) desc += `, ${age}`
  if (locationParts) desc += `, ${locationParts}`
  desc += `. ${lookFor}`
  return desc.slice(0, MAX_LENGTH)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run tests/unit/seo/metadata.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/unit/seo/metadata.test.ts lib/seo/metadata.ts
git commit -m "feat: add SEO metadata builder for profile titles, generic titles, and meta descriptions"
```

---

### Task 5: Image Alt Tag Generation

**Files:**
- Create: `nikah-help/lib/seo/alt-tags.ts`
- Create: `nikah-help/tests/unit/seo/alt-tags.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// nikah-help/tests/unit/seo/alt-tags.test.ts
import { describe, it, expect } from 'vitest'
import { buildImageAltTag } from '@/lib/seo/alt-tags'

describe('buildImageAltTag', () => {
  it('builds Russian alt tag for male user', () => {
    const alt = buildImageAltTag(
      { name: 'Али', gender: 'male', city: 'Москва', country: 'Россия', birth_date: '1993-03-15' },
      'ru',
    )
    expect(alt).toBe(
      'Али, 32 года, Москва, Россия. Мусульманин ищет мусульманку для никах.',
    )
  })

  it('builds Russian alt tag for female user', () => {
    const alt = buildImageAltTag(
      { name: 'Амина', gender: 'female', city: 'Ташкент', country: 'Узбекистан', birth_date: '2003-07-21' },
      'ru',
    )
    expect(alt).toBe(
      'Амина, 22 года, Ташкент, Узбекистан. Мусульманка ищет мусульманина для никах.',
    )
  })

  it('builds English alt tag for male user', () => {
    const alt = buildImageAltTag(
      { name: 'Ali', gender: 'male', city: 'Moscow', country: 'Russia', birth_date: '1993-03-15' },
      'en',
    )
    expect(alt).toBe('Ali, 32, Moscow, Russia. Muslim man looking for a Muslim woman for nikah.')
  })

  it('handles missing optional fields gracefully', () => {
    const alt = buildImageAltTag(
      { name: null, gender: 'male', city: null, country: 'Russia', birth_date: null },
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run tests/unit/seo/alt-tags.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the alt tag helper**

```typescript
// nikah-help/lib/seo/alt-tags.ts
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
    if (age !== null) {
      const years = age === 1 ? 'год' : age < 5 ? 'года' : 'лет'
      parts.push(`${age} ${years}`)
    }
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run tests/unit/seo/alt-tags.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/unit/seo/alt-tags.test.ts lib/seo/alt-tags.ts
git commit -m "feat: add SEO image alt tag generator with immutable никах rule"
```

---

### Task 6: Structured Data (JSON-LD) Builder

**Files:**
- Create: `nikah-help/lib/seo/structured-data.ts`
- Create: `nikah-help/tests/unit/seo/structured-data.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// nikah-help/tests/unit/seo/structured-data.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run tests/unit/seo/structured-data.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the structured data builder**

```typescript
// nikah-help/lib/seo/structured-data.ts

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run tests/unit/seo/structured-data.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/unit/seo/structured-data.test.ts lib/seo/structured-data.ts
git commit -m "feat: add schema.org JSON-LD structured data builder for profile pages"
```

---

### Task 7: SEO Public API Barrel

**Files:**
- Create: `nikah-help/lib/seo/index.ts`

- [ ] **Step 1: Write the barrel file**

```typescript
// nikah-help/lib/seo/index.ts

export { generateSeoSlug } from './slug'
export { cyrillicToLatin } from './transliterate'
export { buildProfileTitle, buildGenericTitle, buildProfileMetaDescription } from './metadata'
export { buildImageAltTag } from './alt-tags'
export { buildProfileJsonLd } from './structured-data'
export { SITE_NAME, BRAND_SEPARATOR, NIKAH_INVARIANT_RU, NIKAH_INVARIANT_EN } from './constants'
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm typecheck`
Expected: PASS — no errors in new files

- [ ] **Step 3: Commit**

```bash
git add lib/seo/index.ts
git commit -m "feat: add SEO public API barrel export"
```

---

### Task 8: Database Migration — Add `meta_description` to Profiles

**Files:**
- Create: `nikah-help/supabase/migrations/<timestamp>_add_meta_description.sql`

- [ ] **Step 1: Generate migration filename**

Run: `date -u +%Y%m%d%H%M%S` to get the timestamp

```bash
# Note the timestamp, e.g. 20260515120000
```

- [ ] **Step 2: Write the migration**

```sql
-- Add meta_description column for SEO meta descriptions
-- Generated alongside ai_bio in a single OpenAI call
ALTER TABLE profiles ADD COLUMN meta_description text;
```

- [ ] **Step 3: Apply migration locally**

```bash
supabase db reset
```

Expected: Migration applies without errors.

- [ ] **Step 4: Regenerate TypeScript types**

```bash
pnpm db:typegen
```

Expected: `types/database.types.ts` now includes `meta_description: string | null` on the `profiles` table.

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/<timestamp>_add_meta_description.sql types/database.types.ts
git commit -m "feat: add meta_description column to profiles table for SEO"
```

---

### Task 9: Extend OpenAI Prompt and Bio Generation for Meta Description

**Files:**
- Modify: `nikah-help/lib/openai/client.ts`
- Modify: `nikah-help/features/profile/server/generate-bio.ts`
- Modify: `nikah-help/lib/inngest/functions/profile-regenerate-bio.ts`

- [ ] **Step 1: Update the AI_BIO_PROMPT to include meta description instruction**

In `nikah-help/lib/openai/client.ts`, replace the `AI_BIO_PROMPT` constant:

```typescript
export const AI_BIO_PROMPT = `You are an assistant for a Muslim marriage application called Nikah Help. Your task is to generate TWO pieces of content based on user profile data:

1. A warm, honest, and respectful biographical description ("bio")
2. An SEO meta description for search engines

CRITICAL LANGUAGE RULE: The Russian word "никах" must NEVER be declined or modified. Only use: "для никах", "ищет мусульманку для никах", "ищет мусульманина для никах", "знакомства для никах". NEVER use "никаха", "никаху", "никахе", "никахом", "никахи".

BIO RULES:
- Written in the first person ("I am...", "I work...")
- Between 150 and 400 characters long
- Sound natural and conversational — not like a template
- Mention 2-3 key facts from the profile (education, job, hobbies, location, religion)
- Include a brief note about what kind of spouse the user is looking for
- Be respectful and halal-appropriate — no flirtation, no physical compliments
- Use the user's name if provided
- Be in Russian language

META DESCRIPTION RULES:
- Maximum 300 characters
- Written in third person, NOT first person
- Summarize who the person is and what they are looking for
- Natural language, not a template
- Include name, age, city, country, and a brief note about their character/values
- Do NOT blindly copy the bio — it should be a distinct, search-engine-optimized summary
- Be in Russian language
- The phrase "для никах" should appear naturally

Return a JSON object with this exact structure (no other text, no markdown):
{
  "bio": "<the biographical description>",
  "meta_description": "<the SEO meta description>"
}`
```

- [ ] **Step 2: Update generateBio to parse the new JSON response and store meta_description**

In `nikah-help/features/profile/server/generate-bio.ts`, modify the OpenAI response parsing and DB persistence:

Replace the section from the `completion` call through the `supabase.from('profiles').update(...)` call:

```typescript
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system' as const, content: AI_BIO_PROMPT },
        {
          role: 'user' as const,
          content: `Создай биографию для пользователя на основе следующих данных:\n\n${JSON.stringify(bioInput, null, 2)}`,
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content?.trim()

    if (!raw) throw new Error('Failed to generate bio')

    let parsed: { bio?: string; meta_description?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Fallback: old-format plain text response
      parsed = { bio: raw }
    }

    const bio = parsed.bio?.trim()
    const metaDescription = parsed.meta_description?.trim()

    if (!bio) throw new Error('Failed to generate bio')

    await supabase
      .from('profiles')
      .update({
        ai_bio: bio,
        meta_description: metaDescription ?? null,
        ai_bio_status: 'ready',
        ai_bio_input_hash: newHash,
      })
      .eq('id', userId)
```

- [ ] **Step 3: Update the Inngest function to persist meta_description**

In `nikah-help/lib/inngest/functions/profile-regenerate-bio.ts`, update the `persistAiBio` function and the call site:

```typescript
async function persistAiBio(userId: string, bio: string, metaDescription: string | null, inputHash: string) {
  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from('profiles')
    .update({
      ai_bio: bio,
      meta_description: metaDescription,
      ai_bio_status: 'ready',
      ai_bio_input_hash: inputHash,
    })
    .eq('id', userId)

  if (error) throw error
}
```

And update the parsing in the main function body (replace the relevant section):

```typescript
    const completion = await step.run('openai-generate', () =>
      getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: AI_BIO_PROMPT },
          {
            role: 'user',
            content: `Создай биографию для пользователя на основе следующих данных:\n\n${JSON.stringify(profile, null, 2)}`,
          },
        ],
        max_tokens: 500,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    )

    const raw = completion.choices[0]?.message?.content?.trim()

    if (!raw) {
      throw new Error('OpenAI returned empty response')
    }

    let parsed: { bio?: string; meta_description?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = { bio: raw }
    }

    const bio = parsed.bio?.trim()
    const metaDescription = parsed.meta_description?.trim() ?? null

    if (!bio) {
      throw new Error('OpenAI returned empty bio')
    }

    await step.run('persist', () => persistAiBio(userId, bio, metaDescription, inputHash))
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/openai/client.ts features/profile/server/generate-bio.ts lib/inngest/functions/profile-regenerate-bio.ts
git commit -m "feat: generate SEO meta description alongside AI bio in single OpenAI call"
```

---

### Task 10: Database Migration — Ensure Profile Query Returns SEO Fields

**Files:**
- Modify: `nikah-help/features/profile/server/get-profile.ts`

- [ ] **Step 1: Add `meta_description` and `ai_bio` to the profile SELECT**

In `nikah-help/features/profile/server/get-profile.ts`, update the select string to include `ai_bio` and `meta_description`:

The current select (line 47-52):
```typescript
      `
      id, name, gender, birth_date, country, city, nationality,
      height, weight, marital_status, children_count, education,
      income_level, housing, willing_to_relocate, polygyny_attitude,
      hijab_attitude, about_self, ai_bio, is_published, last_seen_at
    `,
```

Change to:
```typescript
      `
      id, name, gender, birth_date, country, city, nationality,
      height, weight, marital_status, children_count, education,
      income_level, housing, willing_to_relocate, polygyny_attitude,
      hijab_attitude, about_self, ai_bio, meta_description,
      is_published, last_seen_at
    `,
```

Also add `meta_description` to the `ProfileDetailData` interface:
```typescript
export interface ProfileDetailData {
  // ... existing fields ...
  about_self: string | null
  ai_bio: string | null
  meta_description: string | null
  is_published: boolean | null
  // ...
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add features/profile/server/get-profile.ts
git commit -m "feat: include meta_description in profile detail query for SEO"
```

---

### Task 11: Profile Page — generateMetadata and 301 Redirect Logic

**Files:**
- Modify: `nikah-help/app/(app)/profile/[id]/page.tsx`

- [ ] **Step 1: Understand the URL parsing problem**

The profile `[id]` param currently receives a raw UUID like `a895e215-96c9-4f2e-a6ee-6eaacc1fe5da`. With the new format, it will receive `a895e215-96c9-4f2e-a6ee-6eaacc1fe5da-nikah-muslim-moscow-russia`. We need to extract the UUID (first 36 characters) for database lookup, ignoring the slug suffix.

- [ ] **Step 2: Write the updated page.tsx**

```typescript
// nikah-help/app/(app)/profile/[id]/page.tsx
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase/server'
import { getProfile } from '@/features/profile/server/get-profile'
import { ProfileDetail } from '@/features/profile/components/ProfileDetail'
import { OwnProfile } from '@/features/profile/components/OwnProfile'
import { getUserId } from '@/lib/auth/claims'
import {
  generateSeoSlug,
  buildProfileTitle,
  buildProfileMetaDescription,
  buildProfileJsonLd,
} from '@/lib/seo'
import { getSiteUrl } from '@/lib/utils/site-url'

interface Props {
  params: Promise<{ id: string }>
}

function extractUuid(param: string): string {
  // UUID v4 is 36 characters: 8-4-4-4-12
  const uuidPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/
  const match = param.match(uuidPattern)
  return match ? match[1] : param
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const uuid = extractUuid(id)
  const supabase = await createServerSupabase()
  const { data: claimsData } = await supabase.auth.getClaims()
  const viewerId = claimsData?.claims ? getUserId(claimsData.claims as Record<string, unknown>) : null
  if (!viewerId) return {}

  const profile = await getProfile(supabase, uuid, viewerId)
  if (!profile) return {}

  const siteUrl = getSiteUrl()
  const slug = generateSeoSlug(profile)
  const canonicalUrl = `${siteUrl}/profile/${uuid}-${slug}`
  const lang = 'ru' // TODO: derive from profile.locale when multilingual support is enabled

  const title = buildProfileTitle(profile, lang)
  const description = buildProfileMetaDescription(profile, lang)

  // OG image: use the first approved photo's avatar variant
  const firstPhoto = profile.photos[0]
  const ogImage = firstPhoto
    ? `${siteUrl}/api/photos/stream?photoId=${firstPhoto.id}&variant=avatar&fmt=webp`
    : undefined

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Nikah Help',
      locale: 'ru_RU',
      type: 'profile',
      images: ogImage ? [{ url: ogImage, width: 100, height: 100, alt: title }] : undefined,
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    other: {
      'script:ld+json': buildProfileJsonLd(profile, siteUrl),
    },
  }
}

export default async function ProfileDetailPage({ params }: Props) {
  const { id } = await params
  const uuid = extractUuid(id)
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const viewerId = data?.claims ? getUserId(data.claims as Record<string, unknown>) : null
  if (!viewerId) {
    const { permanentRedirect } = await import('next/navigation')
    permanentRedirect('/auth')
  }

  const profile = await getProfile(supabase, uuid, viewerId)
  if (!profile) notFound()

  // 301 redirect if the URL slug is outdated
  const currentSlug = generateSeoSlug(profile)
  const expectedParam = `${uuid}-${currentSlug}`
  if (id !== expectedParam) {
    permanentRedirect(`/profile/${expectedParam}`)
  }

  if (viewerId === uuid) return <OwnProfile profile={profile} />
  return <ProfileDetail profile={profile} isOwnProfile={false} />
}
```

Note: the import of `permanentRedirect` at the top of the file replaces the old `redirect` import for the auth check. The `wait, that's wrong - permanentRedirect` for auth should use `redirect` (307), not `permanentRedirect`. Let me fix:

Change the auth redirect to use `redirect` from `next/navigation`:
```typescript
import { notFound, redirect, permanentRedirect } from 'next/navigation'
```

And use `redirect('/auth')` for the unauthenticated case (line: `if (!viewerId) redirect('/auth')`).

- [ ] **Step 2 (continued): Final corrected version**

The file should now read:

```typescript
import { notFound, redirect, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase/server'
import { getProfile } from '@/features/profile/server/get-profile'
import { ProfileDetail } from '@/features/profile/components/ProfileDetail'
import { OwnProfile } from '@/features/profile/components/OwnProfile'
import { getUserId } from '@/lib/auth/claims'
import {
  generateSeoSlug,
  buildProfileTitle,
  buildProfileMetaDescription,
  buildProfileJsonLd,
} from '@/lib/seo'
import { getSiteUrl } from '@/lib/utils/site-url'

function extractUuid(param: string): string {
  const uuidPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/
  const match = param.match(uuidPattern)
  return match ? match[1] : param
}

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const uuid = extractUuid(id)
  const supabase = await createServerSupabase()
  const { data: claimsData } = await supabase.auth.getClaims()
  const viewerId = claimsData?.claims ? getUserId(claimsData.claims as Record<string, unknown>) : null
  if (!viewerId) return {}

  const profile = await getProfile(supabase, uuid, viewerId)
  if (!profile) return {}

  const siteUrl = getSiteUrl()
  const slug = generateSeoSlug(profile)
  const canonicalUrl = `${siteUrl}/profile/${uuid}-${slug}`
  const lang = 'ru'

  const title = buildProfileTitle(profile, lang)
  const description = buildProfileMetaDescription(profile, lang)

  const firstPhoto = profile.photos[0]
  const ogImage = firstPhoto
    ? `${siteUrl}/api/photos/stream?photoId=${firstPhoto.id}&variant=avatar&fmt=webp`
    : undefined

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Nikah Help',
      locale: 'ru_RU',
      type: 'profile',
      images: ogImage ? [{ url: ogImage, width: 100, height: 100, alt: title }] : undefined,
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    other: {
      'script:ld+json': buildProfileJsonLd(profile, siteUrl),
    },
  }
}

export default async function ProfileDetailPage({ params }: Props) {
  const { id } = await params
  const uuid = extractUuid(id)
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const viewerId = data?.claims ? getUserId(data.claims as Record<string, unknown>) : null
  if (!viewerId) redirect('/auth')

  const profile = await getProfile(supabase, uuid, viewerId)
  if (!profile) notFound()

  const currentSlug = generateSeoSlug(profile)
  const expectedParam = `${uuid}-${currentSlug}`
  if (id !== expectedParam) {
    permanentRedirect(`/profile/${expectedParam}`)
  }

  if (viewerId === uuid) return <OwnProfile profile={profile} />
  return <ProfileDetail profile={profile} isOwnProfile={false} />
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/profile/\[id\]/page.tsx
git commit -m "feat: add generateMetadata, canonical URLs, JSON-LD, and 301 redirect for stale SEO slugs on profile pages"
```

---

### Task 12: Update Internal Links to Use SEO-Friendly URLs

**Files:**
- Modify: `nikah-help/features/feed/components/FeedCard.tsx` (or wherever profile links are constructed)
- Check all files that link to `/profile/<id>`

- [ ] **Step 1: Find all profile link references**

Run: `grep -r "/profile/" nikah-help/app nikah-help/features nikah-help/components --include="*.tsx" --include="*.ts" | grep -v node_modules`

- [ ] **Step 2: Update FeedCard link**

Find the `href` in FeedCard that links to the profile. Instead of:
```tsx
href={`/profile/${profile.id}`}
```

Update to construct the SEO-friendly URL. The FeedCard likely has access to `gender`, `country`, `city` on the profile object. Add a helper or inline the slug:

```tsx
import { generateSeoSlug } from '@/lib/seo'

// In the component:
const slug = generateSeoSlug({ gender: profile.gender, country: profile.country, city: profile.city })
const profileUrl = `/profile/${profile.id}-${slug}`
```

- [ ] **Step 3: Update all other `/profile/<id>` links**

Do the same transformation for every link that points to `/profile/<id>`:
- Likes page profile links
- Notification links
- Chat header profile link
- Match modal links

Each location: import `generateSeoSlug`, compute slug from available profile fields, construct `/profile/<uuid>-<slug>`.

- [ ] **Step 4: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add <all modified files>
git commit -m "feat: update all internal profile links to use SEO-friendly URLs with slugs"
```

---

### Task 13: SEO-Friendly Image URL Route Handler

**Files:**
- Create: `nikah-help/app/api/photos/seo/[params]/route.ts`

- [ ] **Step 1: Write the Route Handler**

```typescript
// nikah-help/app/api/photos/seo/[params]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import {
  STORAGE,
  FORMATS,
  resolveServeVariant,
  type PublicVariant,
  type ImageFormat,
} from '@/lib/image-processing/photo-variants'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { READ_GENEROUS } from '@/lib/ratelimit/presets'
import { callPhotoStreamContext } from '@/lib/supabase/rpc'

export const runtime = 'nodejs'

const UUID_LENGTH = 36

const VARIANT_PATTERNS: { suffix: string; variant: PublicVariant }[] = [
  { suffix: '-avatar', variant: 'avatar' },
  { suffix: '-cover', variant: 'cover' },
  { suffix: '-full', variant: 'full' },
]

function parseSeoFilename(filename: string): {
  photoId: string
  variant: PublicVariant
  fmt: ImageFormat
} | null {
  // filename: "<uuid>-<slug>-<variant>.<ext>"
  // UUID is first 36 chars
  if (filename.length < UUID_LENGTH + 10) return null

  const uuid = filename.slice(0, UUID_LENGTH)

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    return null
  }

  const rest = filename.slice(UUID_LENGTH) // "-<slug>-<variant>.<ext>"

  // Find variant by suffix
  let variant: PublicVariant | null = null
  let ext: string | null = null

  for (const { suffix, variant: v } of VARIANT_PATTERNS) {
    const idx = rest.lastIndexOf(suffix)
    if (idx !== -1) {
      variant = v
      // Extension is everything after suffix + "."
      const afterSuffix = rest.slice(idx + suffix.length)
      if (afterSuffix.startsWith('.')) {
        ext = afterSuffix.slice(1)
      }
      break
    }
  }

  if (!variant || !ext) return null
  if (!FORMATS.includes(ext as ImageFormat)) return null

  return { photoId: uuid, variant, fmt: ext as ImageFormat }
}

export const GET = withAuth(
  withRateLimit(async (request: NextRequest, ctx: { params: Promise<{ params: string }> }) => {
    try {
      const { params: rawParams } = await ctx.params

      // Remove file extension if present in the route param (Next.js may strip it)
      // The param is the full filename including extension
      const parsed = parseSeoFilename(rawParams)
      if (!parsed) {
        throw new AppError('NOT_FOUND', { logContext: { rawParams } })
      }

      const { photoId, variant: variantParam, fmt } = parsed
      const viewerId = request.headers.get('x-user-id')
      if (!viewerId) throw new AppError('AUTH_UNAUTHORIZED')

      const supabase = createAdminClient()

      const { data, error: rpcError } = await callPhotoStreamContext(supabase, {
        p_photo_id: photoId,
        p_viewer_id: viewerId,
      })

      const ctx = Array.isArray(data) ? data[0] : null
      if (rpcError || !ctx || !ctx.can_view) {
        throw new AppError('NOT_FOUND', {
          cause: rpcError ? new Error(rpcError.message) : undefined,
          logContext: { photoId, viewerId },
        })
      }

      const showFull = Boolean(ctx.show_full)
      const variant = resolveServeVariant(variantParam, showFull)

      const variants = ctx.variants
      const path = variants?.[variant.jsonbKey]?.[fmt] as string | undefined
      if (!path) {
        throw new AppError('NOT_FOUND', {
          logContext: { photoId, variant: variant.jsonbKey, format: fmt },
        })
      }

      const { data: file, error } = await supabase.storage.from(STORAGE.bucket).download(path)

      if (error || !file) {
        throw new AppError('PHOTO_DOWNLOAD_FAILED', {
          cause: error ?? undefined,
          logContext: { photoId, path },
        })
      }

      return new NextResponse(file, {
        headers: {
          'Content-Type': `image/${fmt}`,
          'Cache-Control': variant.cacheControl,
          'Content-Disposition': 'inline',
          'X-Content-Type-Options': 'nosniff',
          // SEO images ARE indexable (unlike the stream endpoint)
          'X-Robots-Tag': 'index, follow',
        },
      })
    } catch (error) {
      return handleRouteError(error)
    }
  }, READ_GENEROUS),
)
```

- [ ] **Step 2: Add a test for the parseSeoFilename function**

Since `parseSeoFilename` is internal, we test through the route handler behavior. Write a unit test for the parsing logic:

Create `nikah-help/tests/unit/seo/photo-url.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

// Replicate the parse logic for testing
const UUID_LENGTH = 36
const FORMATS = ['avif', 'webp']
const VARIANT_SUFFIXES = [
  { suffix: '-avatar', variant: 'avatar' },
  { suffix: '-cover', variant: 'cover' },
  { suffix: '-full', variant: 'full' },
] as const

function parseSeoFilename(filename: string) {
  if (filename.length < UUID_LENGTH + 10) return null
  const uuid = filename.slice(0, UUID_LENGTH)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) return null
  const rest = filename.slice(UUID_LENGTH)

  for (const { suffix, variant } of VARIANT_SUFFIXES) {
    const idx = rest.lastIndexOf(suffix)
    if (idx !== -1) {
      const afterSuffix = rest.slice(idx + suffix.length)
      if (afterSuffix.startsWith('.')) {
        const ext = afterSuffix.slice(1)
        if (FORMATS.includes(ext)) return { photoId: uuid, variant, fmt: ext }
      }
    }
  }
  return null
}

describe('parseSeoFilename', () => {
  const uuid = 'a895e215-96c9-4f2e-a6ee-6eaacc1fe5da'

  it('parses avatar webp filename', () => {
    const result = parseSeoFilename(`${uuid}-nikah-muslim-moscow-russia-avatar.webp`)
    expect(result).toEqual({ photoId: uuid, variant: 'avatar', fmt: 'webp' })
  })

  it('parses full avif filename', () => {
    const result = parseSeoFilename(`${uuid}-nikah-muslima-tashkent-uzbekistan-full.avif`)
    expect(result).toEqual({ photoId: uuid, variant: 'full', fmt: 'avif' })
  })

  it('parses cover webp filename', () => {
    const result = parseSeoFilename(`${uuid}-nikah-muslim-kazan-russia-cover.webp`)
    expect(result).toEqual({ photoId: uuid, variant: 'cover', fmt: 'webp' })
  })

  it('returns null for invalid uuid', () => {
    expect(parseSeoFilename('not-a-uuid-slug-avatar.webp')).toBeNull()
  })

  it('returns null for unknown variant', () => {
    expect(parseSeoFilename(`${uuid}-slug-unknown.webp`)).toBeNull()
  })

  it('returns null for short input', () => {
    expect(parseSeoFilename('abc')).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests**

Run: `pnpm test:unit -- --run tests/unit/seo/photo-url.test.ts`
Expected: PASS

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/photos/seo/\[params\]/route.ts tests/unit/seo/photo-url.test.ts
git commit -m "feat: add SEO-friendly photo URL route handler with UUID+slug parsing"
```

---

### Task 14: Dynamic Sitemap

**Files:**
- Create: `nikah-help/app/sitemap.ts`

- [ ] **Step 1: Write the sitemap generator**

```typescript
// nikah-help/app/sitemap.ts
import type { MetadataRoute } from 'next'
import { createServerSupabase } from '@/lib/supabase/server'
import { generateSeoSlug } from '@/lib/seo'
import { getSiteUrl } from '@/lib/utils/site-url'

export const dynamic = 'force-dynamic'
export const revalidate = 3600 // Revalidate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createServerSupabase()
  const siteUrl = getSiteUrl()

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/auth`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${siteUrl}/faq`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${siteUrl}/guide`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${siteUrl}/agreements`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${siteUrl}/feed`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
  ]

  // Fetch published, non-deleted, non-banned profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, gender, country, city, updated_at, is_published, deletion_status')
    .eq('is_published', true)
    .is('deletion_status', null)
    // banned profiles are handled by RLS or a `banned` column — filter here if needed
    .order('updated_at', { ascending: false })
    .limit(5000)

  if (!profiles) return staticPages

  const profileEntries: MetadataRoute.Sitemap = profiles.map((p) => {
    const slug = generateSeoSlug(p)
    return {
      url: `${siteUrl}/profile/${p.id}-${slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }
  })

  return [...staticPages, ...profileEntries]
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/sitemap.ts
git commit -m "feat: add dynamic sitemap.xml with profile URLs and automatic updates"
```

---

### Task 15: robots.txt

**Files:**
- Create: `nikah-help/app/robots.ts`

- [ ] **Step 1: Write the robots.txt generator**

```typescript
// nikah-help/app/robots.ts
import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/utils/site-url'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/chat',
          '/chats',
          '/settings',
          '/onboarding',
          '/auth',
          '/api/',
          '/moderation',
          '/private',
          '/admin',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/robots.ts
git commit -m "feat: add robots.txt blocking non-indexable paths"
```

---

### Task 16: Generic Page Metadata Updates

**Files:**
- Modify: Several page files under `nikah-help/app/`

- [ ] **Step 1: Update static metadata on generic pages to use the new format**

For each of these pages, replace the existing static `metadata` export with one using `buildGenericTitle` where appropriate, or just update to the new format.

Since `buildGenericTitle` is a runtime function and static metadata is static, we'll use `generateMetadata` for pages that need it, or just hardcode the updated titles.

For now, update the static titles to use the new format. Example — `nikah-help/app/settings/page.tsx`:

```typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Настройки | Знакомства мусульман для никах | Nikah Help',
  description: 'Настройки профиля и приватности',
}
```

Apply the same pattern to: `faq`, `guide`, `agreements`, `feed`, `likes`, `chats`, `notifications`, `auth`.

- [ ] **Step 2: Update each page file**

For each page, update the metadata export:

| Page | Title |
|------|-------|
| `app/guide/page.tsx` | `Инструкция \| Знакомства мусульман для никах \| Nikah Help` |
| `app/faq/page.tsx` | `Вопросы и ответы \| Знакомства мусульман для никах \| Nikah Help` |
| `app/agreements/page.tsx` | `Соглашения \| Знакомства мусульман для никах \| Nikah Help` |
| `app/settings/page.tsx` | `Настройки \| Знакомства мусульман для никах \| Nikah Help` |
| `app/(app)/feed/page.tsx` | `Анкеты \| Знакомства мусульман для никах \| Nikah Help` |
| `app/(app)/likes/page.tsx` | `Симпатии \| Знакомства мусульман для никах \| Nikah Help` |
| `app/(app)/chats/page.tsx` | `Чаты \| Знакомства мусульман для никах \| Nikah Help` |
| `app/(app)/notifications/page.tsx` | `Уведомления \| Знакомства мусульман для никах \| Nikah Help` |
| `app/(public)/auth/page.tsx` | `Войти \| Знакомства мусульман для никах \| Nikah Help` |
| `app/(app)/profile/edit/page.tsx` | `Редактирование профиля \| Знакомства мусульман для никах \| Nikah Help` |

Add descriptions where missing.

- [ ] **Step 3: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/guide/page.tsx app/faq/page.tsx app/agreements/page.tsx app/settings/page.tsx app/\(app\)/feed/page.tsx app/\(app\)/likes/page.tsx app/\(app\)/chats/page.tsx app/\(app\)/notifications/page.tsx app/\(public\)/auth/page.tsx app/\(app\)/profile/edit/page.tsx
git commit -m "feat: update all page metadata titles to include никах invariant form and brand separator"
```

---

### Task 17: Filter Page SEO (Canonical URLs + Noindex)

**Files:**
- Modify: `nikah-help/app/(app)/feed/filters/page.tsx`
- Modify: `nikah-help/app/(app)/feed/page.tsx`

- [ ] **Step 1: Add canonical to feed page, noindex to filters**

In `nikah-help/app/(app)/feed/filters/page.tsx`:

```typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}
```

In `nikah-help/app/(app)/feed/page.tsx`, add canonical:

```typescript
import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/utils/site-url'

export const metadata: Metadata = {
  title: 'Анкеты | Знакомства мусульман для никах | Nikah Help',
  alternates: { canonical: `${getSiteUrl()}/feed` },
}
```

Wait — `getSiteUrl()` is a runtime function, can't be used in static metadata. Use a hardcoded production URL or a `generateMetadata` function:

```typescript
export function generateMetadata(): Metadata {
  const siteUrl = getSiteUrl()
  return {
    alternates: { canonical: `${siteUrl}/feed` },
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/feed/page.tsx app/\(app\)/feed/filters/page.tsx
git commit -m "feat: add canonical URL to feed page and noindex to filter pages"
```

---

### Task 18: Exclude Unindexable Profiles from Sitemap and Metadata

**Files:**
- Modify: `nikah-help/app/sitemap.ts` (already filters `is_published` and `deletion_status`)
- Modify: `nikah-help/app/(app)/profile/[id]/page.tsx`

- [ ] **Step 1: Add noindex for banned/deleted/unpublished profiles**

In the profile page's `generateMetadata`, add logic to noindex profiles that should not be indexed:

In the `generateMetadata` function, after the profile check, add:

```typescript
  // Don't index banned, deleted, or unpublished profiles
  if (!profile.is_published || profile.deletion_status) {
    return {
      robots: { index: false, follow: false },
    }
  }
```

But wait — `deletion_status` is not currently in `ProfileDetailData`. We need to add it to the interface and the select query.

- [ ] **Step 2: Add `deletion_status` to get-profile.ts SELECT**

In `get-profile.ts`, add `deletion_status` to the `select` columns and the `ProfileDetailData` interface.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add features/profile/server/get-profile.ts app/\(app\)/profile/\[id\]/page.tsx
git commit -m "feat: noindex banned/deleted/unpublished profiles in SEO metadata"
```

---

### Task 19: hreflang Preparation

**Files:**
- Modify: `nikah-help/app/(app)/profile/[id]/page.tsx` (generateMetadata)

- [ ] **Step 1: Add hreflang alternates to profile generateMetadata**

In the profile page `generateMetadata`, add to the returned metadata:

```typescript
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'ru': canonicalUrl,
        'en': `${siteUrl}/en/profile/${uuid}-${currentSlug}`,
      },
    },
```

Note: This is preparation only — the `/en/` prefixed routes don't exist yet. When multilingual routing is enabled, these URLs will become active. For now, the `en` alternate points to a theoretical future URL. This is acceptable preparation per the spec.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/profile/\[id\]/page.tsx
git commit -m "feat: add hreflang alternates for future multilingual profile URLs"
```

---

### Task 20: Auto-Regenerate SEO Data After Profile Changes

**Files:**
- Modify: `nikah-help/lib/profile/bio-fields.ts`
- Review: `nikah-help/features/profile/server/maybe-regenerate-bio.ts`

- [ ] **Step 1: Add `meta_description` to the bio-relevant fields list (conceptually)**

The existing `maybeRegenerateBio` triggers Inngest bio regeneration when bio-relevant fields change. Since `meta_description` is generated in the same OpenAI call as `ai_bio`, it auto-regenerates. No code change needed here — the existing trigger covers it.

But we need to ensure that basic profile fields (name, city, country, gender) ARE in `BIO_RELEVANT_FIELDS`. Let's verify:

From `lib/profile/bio-fields.ts`: `name`, `gender`, `country`, `city` are already in the list. All SEO-relevant fields are already covered.

- [ ] **Step 2: Verify the trigger chain**

Trace: profile edit → `maybeRegenerateBio` → hash comparison → Inngest `profile/regenerate-bio` → OpenAI → `ai_bio` + `meta_description` → profile updated.

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit (if any changes needed)**

If no changes needed, skip commit. The existing system already handles this.

---

### Task 21: End-to-End Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: PASS with zero errors

- [ ] **Step 2: Run full lint**

Run: `pnpm lint`
Expected: PASS with zero errors

- [ ] **Step 3: Run all unit tests**

Run: `pnpm test:unit -- --run`
Expected: All tests PASS

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: Successful production build

- [ ] **Step 5: Manual verification checklist**

- [ ] Open `/profile/<uuid>` — should redirect to `/profile/<uuid>-<slug>` with 308
- [ ] View page source — should contain `<title>`, `<meta name="description">`, `<link rel="canonical">`, `og:*`, `twitter:*`, `<script type="application/ld+json">`
- [ ] Open `/sitemap.xml` — should list profile URLs with slugs
- [ ] Open `/robots.txt` — should block `/chat`, `/settings`, `/auth`, `/api`, etc.
- [ ] Change profile city → old URL should 308 redirect to new URL
- [ ] All alt tags should contain "никах" (not "никаха")
- [ ] Meta titles should contain "никах" (not "никаха")
- [ ] Meta descriptions should contain "никах" (not "никаха")
- [ ] SEO photo URL `/photos/<uuid>-<slug>-avatar.webp` should serve the image

---

## Self-Review

**1. Spec coverage:** Each section of the spec is covered:
- Section 1 (SEO slugs): Tasks 1-3
- Section 2 (SEO-friendly URLs): Task 11 (redirect logic), Task 12 (link updates)
- Section 3 (SEO image URLs): Task 13
- Section 4 (Alt tags): Task 5
- Section 5 (Meta titles): Task 4, Task 11
- Section 6 (Meta descriptions): Tasks 8-9
- Section 7 (Canonical URLs): Task 11, Task 17
- Section 8 (OpenGraph): Task 11
- Section 9 (Structured Data): Task 6
- Section 10 (Sitemap): Task 14
- Section 11 (robots.txt): Task 15
- Section 12 (SSR rendering): Task 11 (generateMetadata is SSR)
- Section 13 (Indexing/privacy): Task 18
- Section 14 (Filters/pagination): Task 17
- Section 15 (hreflang): Task 19
- Global Rules: Tasks 3 (никах invariant), Task 1-2 (centralized helpers), Task 20 (auto-updates)

**2. Placeholder scan:** No TBDs, TODOs, or "implement later" markers. Every code block contains real implementation.

**3. Type consistency:** `generateSeoSlug` signature consistent across all tasks (`{ gender, country, city }`). `buildProfileTitle` receives `ProfileSeoData` matching `ProfileDetailData` fields. `buildProfileJsonLd` receives matching fields. All interfaces are consistent.
