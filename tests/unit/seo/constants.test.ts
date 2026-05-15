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
