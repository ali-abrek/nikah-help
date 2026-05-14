import { describe, it, expect } from 'vitest'
import {
  onboardingStep1Schema,
  onboardingStep2MaleSchema,
  onboardingStep2FemaleSchema,
} from '@/features/profile/schemas'

// ── Step 1 helpers ──────────────────────────────────────────────────

function validStep1(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ахмад',
    birth_date: '1995-01-15',
    gender: 'male',
    country: 'Россия',
    city: 'Москва',
    nationality: 'татарин',
    height: 175,
    weight: 70,
    allow_geolocation: false,
    ...overrides,
  }
}

describe('onboardingStep1Schema', () => {
  it('accepts valid step 1 data', () => {
    const result = onboardingStep1Schema.safeParse(validStep1())
    expect(result.success).toBe(true)
  })

  it('rejects name shorter than 2 chars', () => {
    const result = onboardingStep1Schema.safeParse(validStep1({ name: 'A' }))
    expect(result.success).toBe(false)
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.path[0])
      expect(issues).toContain('name')
    }
  })

  it('rejects name longer than 50 chars', () => {
    const result = onboardingStep1Schema.safeParse(validStep1({ name: 'A'.repeat(51) }))
    expect(result.success).toBe(false)
  })

  it('rejects invalid birth_date format', () => {
    const result = onboardingStep1Schema.safeParse(validStep1({ birth_date: 'not-a-date' }))
    expect(result.success).toBe(false)
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.path[0])
      expect(issues).toContain('birth_date')
    }
  })

  it('rejects date when user is under 18', () => {
    const today = new Date()
    const seventeenYearsAgo = new Date(today.getFullYear() - 17, today.getMonth(), today.getDate())
      .toISOString()
      .split('T')[0]
    const result = onboardingStep1Schema.safeParse(validStep1({ birth_date: seventeenYearsAgo! }))
    expect(result.success).toBe(false)
  })

  it('accepts date exactly 18 years ago', () => {
    const today = new Date()
    const eighteenYearsAgo = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
      .toISOString()
      .split('T')[0]
    const result = onboardingStep1Schema.safeParse(validStep1({ birth_date: eighteenYearsAgo! }))
    expect(result.success).toBe(true)
  })

  it('accepts date older than 18 years', () => {
    const result = onboardingStep1Schema.safeParse(validStep1({ birth_date: '1980-06-01' }))
    expect(result.success).toBe(true)
  })

  it('rejects invalid gender', () => {
    const result = onboardingStep1Schema.safeParse(validStep1({ gender: 'other' }))
    expect(result.success).toBe(false)
  })

  it('accepts female gender', () => {
    const result = onboardingStep1Schema.safeParse(validStep1({ gender: 'female' }))
    expect(result.success).toBe(true)
  })

  it('rejects empty country', () => {
    const result = onboardingStep1Schema.safeParse(validStep1({ country: '' }))
    expect(result.success).toBe(false)
  })

  it('rejects empty city', () => {
    const result = onboardingStep1Schema.safeParse(validStep1({ city: '' }))
    expect(result.success).toBe(false)
  })

  it('rejects height below 100', () => {
    const result = onboardingStep1Schema.safeParse(validStep1({ height: 99 }))
    expect(result.success).toBe(false)
  })

  it('rejects height above 250', () => {
    const result = onboardingStep1Schema.safeParse(validStep1({ height: 251 }))
    expect(result.success).toBe(false)
  })

  it('rejects weight below 30', () => {
    const result = onboardingStep1Schema.safeParse(validStep1({ weight: 29 }))
    expect(result.success).toBe(false)
  })

  it('rejects non-integer height', () => {
    const result = onboardingStep1Schema.safeParse(validStep1({ height: 175.5 }))
    expect(result.success).toBe(false)
  })
})

// ── Step 2: Male ────────────────────────────────────────────────────

function validMaleStep2(overrides: Record<string, unknown> = {}) {
  return {
    marital_status: 'single',
    children_count: 0,
    income_level: 'middle',
    housing: 'apartment',
    about_self: 'Мусульманин, соблюдающий, работаю в IT',
    ...overrides,
  }
}

describe('onboardingStep2MaleSchema', () => {
  it('accepts valid male step 2 data', () => {
    const result = onboardingStep2MaleSchema.safeParse(validMaleStep2())
    expect(result.success).toBe(true)
  })

  it('accepts all marital statuses including polygyny options', () => {
    for (const status of ['single', 'divorced', 'widowed', 'married_1', 'married_2', 'married_3']) {
      const result = onboardingStep2MaleSchema.safeParse(validMaleStep2({ marital_status: status }))
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid marital status', () => {
    const result = onboardingStep2MaleSchema.safeParse(
      validMaleStep2({ marital_status: 'married_5' }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects negative children count', () => {
    const result = onboardingStep2MaleSchema.safeParse(validMaleStep2({ children_count: -1 }))
    expect(result.success).toBe(false)
  })

  it('rejects about_self shorter than 10 chars', () => {
    const result = onboardingStep2MaleSchema.safeParse(validMaleStep2({ about_self: 'short' }))
    expect(result.success).toBe(false)
  })

  it('rejects invalid income level', () => {
    const result = onboardingStep2MaleSchema.safeParse(
      validMaleStep2({ income_level: 'billionaire' }),
    )
    expect(result.success).toBe(false)
  })

  it('accepts all housing types', () => {
    for (const h of ['rent', 'apartment', 'house', 'parents']) {
      const result = onboardingStep2MaleSchema.safeParse(validMaleStep2({ housing: h }))
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid housing', () => {
    const result = onboardingStep2MaleSchema.safeParse(validMaleStep2({ housing: 'castle' }))
    expect(result.success).toBe(false)
  })
})

// ── Step 2: Female ──────────────────────────────────────────────────

function validFemaleStep2(overrides: Record<string, unknown> = {}) {
  return {
    marital_status: 'single',
    children_count: 0,
    willing_to_relocate: 'country',
    polygyny_attitude: 'positive',
    hijab_attitude: 'hijab',
    about_self: 'Мусульманка, изучаю ислам, люблю готовить',
    ...overrides,
  }
}

describe('onboardingStep2FemaleSchema', () => {
  it('accepts valid female step 2 data', () => {
    const result = onboardingStep2FemaleSchema.safeParse(validFemaleStep2())
    expect(result.success).toBe(true)
  })

  it('rejects when willing_to_relocate is missing', () => {
    const data = validFemaleStep2()
    delete (data as Record<string, unknown>).willing_to_relocate
    const result = onboardingStep2FemaleSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it('accepts all relocation options', () => {
    for (const opt of ['none', 'region', 'country', 'abroad']) {
      const result = onboardingStep2FemaleSchema.safeParse(
        validFemaleStep2({ willing_to_relocate: opt }),
      )
      expect(result.success).toBe(true)
    }
  })

  it('accepts all hijab attitudes', () => {
    for (const attitude of ['no_hijab', 'hijab', 'niqab']) {
      const result = onboardingStep2FemaleSchema.safeParse(
        validFemaleStep2({ hijab_attitude: attitude }),
      )
      expect(result.success).toBe(true)
    }
  })

  it('accepts all polygyny attitudes', () => {
    for (const attitude of ['positive', 'negative']) {
      const result = onboardingStep2FemaleSchema.safeParse(
        validFemaleStep2({ polygyny_attitude: attitude }),
      )
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid polygyny attitude', () => {
    const result = onboardingStep2FemaleSchema.safeParse(
      validFemaleStep2({ polygyny_attitude: 'neutral' }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects about_self shorter than 10 chars for female', () => {
    const result = onboardingStep2FemaleSchema.safeParse(validFemaleStep2({ about_self: 'hi' }))
    expect(result.success).toBe(false)
  })
})
