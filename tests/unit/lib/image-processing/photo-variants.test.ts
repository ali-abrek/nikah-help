import { describe, it, expect } from 'vitest'
import {
  PHOTO_VARIANTS,
  PUBLIC_VARIANTS,
  FORMATS,
  COMPRESSION,
  UPLOAD,
  resolveServeVariant,
  getBlurredVariant,
  buildStoragePath,
  buildVariantsJsonb,
} from '@/lib/image-processing/photo-variants'

describe('photo variant config', () => {
  it('should have exactly 5 variants', () => {
    expect(Object.keys(PHOTO_VARIANTS)).toHaveLength(5)
  })

  it('should have 3 public variants', () => {
    expect(PUBLIC_VARIANTS).toEqual(['avatar', 'cover', 'full'])
  })

  it('should have 2 formats', () => {
    expect(FORMATS).toEqual(['avif', 'webp'])
  })

  it('should have unique jsonb keys', () => {
    const keys = Object.values(PHOTO_VARIANTS).map((v) => v.jsonbKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('should have unique file suffixes', () => {
    const suffixes = Object.values(PHOTO_VARIANTS).map((v) => v.fileSuffix)
    expect(new Set(suffixes).size).toBe(suffixes.length)
  })

  it('should never blur the avatar', () => {
    const avatarVariant = PHOTO_VARIANTS['avatar']!
    expect(avatarVariant.generateBlurred).toBe(false)
    expect(getBlurredVariant('avatar')).toBeNull()
  })

  it('should blur cover and full when showFull is false', () => {
    const coverBlurred = resolveServeVariant('cover', false)
    expect(coverBlurred.jsonbKey).toBe('cover_blurred')
    expect(coverBlurred.blur).toBe(40)

    const fullBlurred = resolveServeVariant('full', false)
    expect(fullBlurred.jsonbKey).toBe('full_blurred')
    expect(fullBlurred.blur).toBe(60)

    const avatarResult = resolveServeVariant('avatar', false)
    expect(avatarResult.jsonbKey).toBe('avatar')
    expect(avatarResult.blur).toBeNull()
  })

  it('should serve unblurred when showFull is true', () => {
    expect(resolveServeVariant('cover', true).jsonbKey).toBe('cover')
    expect(resolveServeVariant('full', true).jsonbKey).toBe('full')
    expect(resolveServeVariant('avatar', true).jsonbKey).toBe('avatar')
  })

  it('should have valid aspect ratios for all variants', () => {
    for (const variant of Object.values(PHOTO_VARIANTS)) {
      const v = variant as { aspectRatio: { w: number; h: number }; width: number; height: number }
      const { w, h } = v.aspectRatio
      expect(w).toBeGreaterThan(0)
      expect(h).toBeGreaterThan(0)
      expect(v.width / v.height).toBeCloseTo(w / h, 1)
    }
  })

  it('should map fileSuffixes to hyphenated paths', () => {
    const blurredVariants = Object.values(PHOTO_VARIANTS).filter((v) => v.jsonbKey.includes('_'))

    for (const v of blurredVariants) {
      expect(v.fileSuffix).toContain('-')
      expect(v.fileSuffix).not.toContain('_')
    }
  })

  it('should build correct storage path', () => {
    const path = buildStoragePath('user-1', 'photo-1', PHOTO_VARIANTS['avatar']!, 'avif')
    expect(path).toBe('user-1/photo-1-avatar.avif')
  })

  it('should build complete variants jsonb', () => {
    const jsonb = buildVariantsJsonb('user-1', 'photo-1')

    expect(Object.keys(jsonb)).toHaveLength(5)
    expect(jsonb['avatar']!.avif).toBe('user-1/photo-1-avatar.avif')
    expect(jsonb['cover_blurred']!.webp).toBe('user-1/photo-1-cover-blurred.webp')
  })

  it('should have compression settings for every format', () => {
    for (const fmt of FORMATS) {
      expect(COMPRESSION[fmt]).toBeDefined()
      expect(COMPRESSION[fmt].quality).toBeGreaterThan(0)
      expect(COMPRESSION[fmt].quality).toBeLessThanOrEqual(100)
    }
  })

  it('should have valid dimensions for every variant', () => {
    for (const variant of Object.values(PHOTO_VARIANTS)) {
      expect(variant.width).toBeGreaterThan(0)
      expect(variant.height).toBeGreaterThan(0)
      expect(Number.isInteger(variant.width)).toBe(true)
      expect(Number.isInteger(variant.height)).toBe(true)
    }
  })

  it('should not have contradictory blur settings', () => {
    for (const variant of Object.values(PHOTO_VARIANTS)) {
      if (variant.blur !== null) {
        expect(variant.generateBlurred).toBe(false)
        expect(variant.jsonbKey).toMatch(/_blurred$/)
      }
      if (variant.generateBlurred) {
        expect(variant.blur).toBeNull()
        expect(variant.jsonbKey).not.toMatch(/_blurred$/)
      }
    }
  })

  it('should have reasonable upload constraints', () => {
    expect(UPLOAD.maxFileSize).toBe(10 * 1024 * 1024)
    expect(UPLOAD.minShortSide).toBeGreaterThan(0)
    expect(UPLOAD.maxPhotosPerProfile).toBe(6)
    expect(UPLOAD.acceptedMimeTypes.length).toBeGreaterThanOrEqual(3)
  })
})
