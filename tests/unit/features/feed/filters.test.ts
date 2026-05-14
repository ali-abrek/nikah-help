import { describe, it, expect } from 'vitest'
import {
  feedFiltersSchema,
  feedFiltersMaleSchema,
  feedFiltersFemaleSchema,
  RADIUS_RANGE,
  AGE_RANGE,
} from '@/features/feed/schemas'

describe('feed filters schema', () => {
  it('accepts empty filters for male viewer', () => {
    const result = feedFiltersSchema.safeParse({ gender: 'male' })
    expect(result.success).toBe(true)
  })

  it('accepts empty filters for female viewer', () => {
    const result = feedFiltersSchema.safeParse({ gender: 'female' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid gender', () => {
    const result = feedFiltersSchema.safeParse({ gender: 'other' })
    expect(result.success).toBe(false)
  })

  it('accepts male-specific filters when gender is male', () => {
    const result = feedFiltersSchema.safeParse({
      gender: 'male',
      polygyny_attitude: ['positive'],
      hijab_attitude: ['hijab'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts female-specific filters when gender is female', () => {
    const result = feedFiltersSchema.safeParse({
      gender: 'female',
      income_level: ['high'],
      housing: ['apartment'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts age range filters', () => {
    const result = feedFiltersMaleSchema.safeParse({
      age_min: 25,
      age_max: 35,
    })
    expect(result.success).toBe(true)
  })

  it('rejects age_min below 18', () => {
    const result = feedFiltersMaleSchema.safeParse({ age_min: 10 })
    expect(result.success).toBe(false)
  })

  it('rejects age_max above 120', () => {
    const result = feedFiltersMaleSchema.safeParse({ age_max: 150 })
    expect(result.success).toBe(false)
  })

  it('accepts radius within valid range', () => {
    const result = feedFiltersMaleSchema.safeParse({ radius_km: 500 })
    expect(result.success).toBe(true)
  })

  it('rejects radius below minimum', () => {
    const result = feedFiltersMaleSchema.safeParse({ radius_km: 10 })
    expect(result.success).toBe(false)
  })

  it('rejects radius above maximum', () => {
    const result = feedFiltersMaleSchema.safeParse({ radius_km: 2000 })
    expect(result.success).toBe(false)
  })

  it('accepts marital status filter for both genders', () => {
    const male = feedFiltersMaleSchema.safeParse({
      marital_status: ['single', 'divorced'],
    })
    const female = feedFiltersFemaleSchema.safeParse({
      marital_status: ['single', 'widowed'],
    })
    expect(male.success).toBe(true)
    expect(female.success).toBe(true)
  })

  it('accepts children count max filter', () => {
    const result = feedFiltersMaleSchema.safeParse({ children_count_max: 3 })
    expect(result.success).toBe(true)
  })

  it('rejects children count max below 0', () => {
    const result = feedFiltersMaleSchema.safeParse({ children_count_max: -1 })
    expect(result.success).toBe(false)
  })

  // ── Defaults ──────────────────────────────────────────────────────

  it('RADIUS_RANGE has valid min/max', () => {
    expect(RADIUS_RANGE.min).toBe(50)
    expect(RADIUS_RANGE.max).toBe(1000)
    expect(RADIUS_RANGE.step).toBe(50)
  })

  it('AGE_RANGE has valid min/max', () => {
    expect(AGE_RANGE.min).toBe(18)
    expect(AGE_RANGE.max).toBe(120)
  })
})
