import { z } from 'zod'

export const AGE_RANGE = { min: 18, max: 120 } as const

export const RADIUS_RANGE = { min: 50, max: 1000, step: 50 } as const

const maritalStatuses = [
  'single',
  'divorced',
  'widowed',
  'married_1',
  'married_2',
  'married_3',
] as const

const incomeLevels = ['low', 'middle', 'high'] as const
const housingTypes = ['rent', 'apartment', 'house', 'parents'] as const
const polygynyAttitudes = ['positive', 'negative'] as const
const hijabAttitudes = ['no_hijab', 'hijab', 'niqab'] as const

// ── Base filters (both genders) ────────────────────────────────────

export const feedFiltersBaseSchema = z.object({
  age_min: z.number().int().min(18).max(120).optional(),
  age_max: z.number().int().min(18).max(120).optional(),
  marital_status: z.array(z.enum(maritalStatuses)).optional(),
  children_count_max: z.number().int().min(0).max(20).optional(),
  radius_km: z.number().int().min(RADIUS_RANGE.min).max(RADIUS_RANGE.max).optional(),
})

// ── Male-specific filters ──────────────────────────────────────────

export const feedFiltersMaleSchema = feedFiltersBaseSchema.extend({
  polygyny_attitude: z.array(z.enum(polygynyAttitudes)).optional(),
  hijab_attitude: z.array(z.enum(hijabAttitudes)).optional(),
})

// ── Female-specific filters ────────────────────────────────────────

export const feedFiltersFemaleSchema = feedFiltersBaseSchema.extend({
  income_level: z.array(z.enum(incomeLevels)).optional(),
  housing: z.array(z.enum(housingTypes)).optional(),
})

// ── Combined ────────────────────────────────────────────────────────

export const feedFiltersSchema = z.discriminatedUnion('gender', [
  z.object({ gender: z.literal('male'), ...feedFiltersMaleSchema.shape }),
  z.object({ gender: z.literal('female'), ...feedFiltersFemaleSchema.shape }),
])

export type FeedFilters = z.infer<typeof feedFiltersSchema>
export type FeedFiltersMale = z.infer<typeof feedFiltersMaleSchema>
export type FeedFiltersFemale = z.infer<typeof feedFiltersFemaleSchema>

// Flat record for the query builder, which searches for the opposite gender
export interface FeedFilterValues {
  age_min?: number
  age_max?: number
  marital_status?: string[]
  children_count_max?: number
  radius_km?: number
  polygyny_attitude?: string[]
  hijab_attitude?: string[]
  income_level?: string[]
  housing?: string[]
}

// ── Defaults ────────────────────────────────────────────────────────

export const DEFAULT_FILTERS_MALE: FeedFiltersMale = {}
export const DEFAULT_FILTERS_FEMALE: FeedFiltersFemale = {}

// ── Persisted filter preferences (stored as JSONB on profiles) ──────

export interface FilterPreferences {
  locMode?: 'place' | 'radius'
  country?: string
  city?: string
  radiusKm?: number
  ageMin?: number
  ageMax?: number
  marital?: string | null
  children?: 'any' | 'none' | 'has'
  polygamy?: 'any' | 'mono' | 'open'
  hijab?: string | null
  income?: string | null
  housing?: string | null
}

// ── Feed profile result type ────────────────────────────────────────

export interface FeedProfile {
  id: string
  name: string
  gender: 'male' | 'female'
  birth_date: string
  country: string | null
  city: string | null
  ai_bio: string | null
  marital_status: string | null
  children_count: number | null
  cover_photo_url: string | null
  created_at: string
  viewer_has_liked: boolean
  is_matched: boolean
}

export interface FeedPage {
  profiles: FeedProfile[]
  nextCursor: string | null
}
