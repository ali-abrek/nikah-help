import { z } from 'zod'

const eighteenYearsAgo = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 18)
  return d
}

// ── Step 1: Basic Data ────────────────────────────────────────────

export const onboardingStep1Schema = z.object({
  name: z
    .string()
    .min(2, { error: 'Минимум 2 символа' })
    .max(50, { error: 'Максимум 50 символов' }),
  birth_date: z.string().refine((val) => {
    const date = new Date(val)
    if (isNaN(date.getTime())) return false
    return date <= eighteenYearsAgo()
  }, { error: 'Вам должно быть не менее 18 лет' }),
  gender: z.enum(['male', 'female'], { error: 'Выберите пол' }),
  country: z.string().min(1, { error: 'Выберите страну' }),
  city: z.string().min(1, { error: 'Выберите город' }),
  nationality: z.string().min(1, { error: 'Укажите национальность' }),
  height: z
    .number({ error: 'Укажите рост' })
    .int()
    .min(100, { error: 'Минимум 100 см' })
    .max(250, { error: 'Максимум 250 см' }),
  weight: z
    .number({ error: 'Укажите вес' })
    .int()
    .min(30, { error: 'Минимум 30 кг' })
    .max(300, { error: 'Максимум 300 кг' }),
  allow_geolocation: z.boolean(),
})

export type OnboardingStep1Data = z.infer<typeof onboardingStep1Schema>

// ── Step 2: Extended Data (shared) ─────────────────────────────────

const maritalStatuses = [
  'single',
  'divorced',
  'widowed',
  'married_1',
  'married_2',
  'married_3',
] as const

const educations = [
  'none',
  'school',
  'vocational',
  'bachelor',
  'master',
  'phd',
] as const

const incomeLevels = ['low', 'middle', 'high'] as const
const housingTypes = ['own', 'rent', 'parents', 'shared'] as const

const polygynyAttitudes = ['positive', 'neutral', 'negative'] as const
const hijabAttitudes = [
  'niqab',
  'hijab_full',
  'hijab_partial',
  'no_hijab',
] as const

// ── Step 2: Male variant ──────────────────────────────────────────

export const onboardingStep2MaleSchema = z.object({
  marital_status: z.enum(maritalStatuses, { error: 'Выберите семейное положение' }),
  children_count: z
    .number({ error: 'Укажите количество детей' })
    .int()
    .min(0)
    .max(20),
  education: z.enum(educations, { error: 'Выберите образование' }),
  income_level: z.enum(incomeLevels, { error: 'Выберите уровень дохода' }),
  housing: z.enum(housingTypes, { error: 'Выберите тип жилья' }),
  about_self: z
    .string()
    .min(10, { error: 'Минимум 10 символов' })
    .max(2000, { error: 'Максимум 2000 символов' }),
})

export type OnboardingStep2MaleData = z.infer<typeof onboardingStep2MaleSchema>

// ── Step 2: Female variant ────────────────────────────────────────

export const onboardingStep2FemaleSchema = z.object({
  marital_status: z.enum(maritalStatuses, { error: 'Выберите семейное положение' }),
  children_count: z
    .number({ error: 'Укажите количество детей' })
    .int()
    .min(0)
    .max(20),
  education: z.enum(educations, { error: 'Выберите образование' }),
  willing_to_relocate: z.boolean({ error: 'Укажите готовность к переезду' }),
  polygyny_attitude: z.enum(polygynyAttitudes, { error: 'Укажите отношение к многожёнству' }),
  hijab_attitude: z.enum(hijabAttitudes, { error: 'Укажите отношение к хиджабу' }),
  about_self: z
    .string()
    .min(10, { error: 'Минимум 10 символов' })
    .max(2000, { error: 'Максимум 2000 символов' }),
})

export type OnboardingStep2FemaleData = z.infer<typeof onboardingStep2FemaleSchema>

// ── Photo CRUD ────────────────────────────────────────────────────

export const reorderPhotosSchema = z.object({
  orderedPhotoIds: z
    .array(z.uuid({ error: 'Invalid photo ID' }))
    .min(1, { error: 'At least one photo required' })
    .max(6, { error: 'Maximum 6 photos' }),
})

export type ReorderPhotosData = z.infer<typeof reorderPhotosSchema>
