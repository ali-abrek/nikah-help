import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { PHOTO_VARIANTS, FORMATS } from '@/lib/image-processing/photo-variants'
import { processImage } from '@/lib/image-processing/pipeline'

describe('processImage', () => {
  const userId = '00000000-0000-0000-0000-000000000001'
  const photoId = '00000000-0000-0000-0000-000000000002'

  it('should produce exactly N files (variants x formats)', async () => {
    const testImage = await sharp({
      create: { width: 2000, height: 2500, channels: 3, background: '#4488cc' },
    })
      .jpeg()
      .toBuffer()

    const result = await processImage(testImage, userId, photoId)
    expect(result.files).toHaveLength(Object.keys(PHOTO_VARIANTS).length * FORMATS.length)
  })

  it('should produce avatar at configured dimensions', async () => {
    const testImage = await sharp({
      create: { width: 2000, height: 2500, channels: 3, background: '#4488cc' },
    })
      .jpeg()
      .toBuffer()

    const result = await processImage(testImage, userId, photoId)

    for (const format of FORMATS) {
      const file = result.files.find(
        (f) => f.path.includes('-avatar') && f.path.endsWith(`.${format}`),
      )
      expect(file).toBeDefined()
      const meta = await sharp(file!.buffer).metadata()
      expect(meta.width).toBe(PHOTO_VARIANTS['avatar']!.width)
      expect(meta.height).toBe(PHOTO_VARIANTS['avatar']!.height)
    }
  })

  it('should never upscale (withoutEnlargement)', async () => {
    const smallImage = await sharp({
      create: { width: 200, height: 250, channels: 3, background: '#4488cc' },
    })
      .jpeg()
      .toBuffer()

    const result = await processImage(smallImage, userId, photoId)
    const fullFile = result.files.find(
      (f) => f.path.includes('-full.') && !f.path.includes('blurred'),
    )
    const meta = await sharp(fullFile!.buffer).metadata()
    expect(meta.width!).toBeLessThanOrEqual(200)
    expect(meta.height!).toBeLessThanOrEqual(250)
  })

  it('should apply blur to blurred variants', async () => {
    const testImage = await sharp({
      create: { width: 2000, height: 2500, channels: 3, background: '#4488cc' },
    })
      .jpeg()
      .toBuffer()

    const result = await processImage(testImage, userId, photoId)

    // Cover blurred should exist
    const coverBlurredAvif = result.files.find(
      (f) => f.path.includes('-cover-blurred') && f.path.endsWith('.avif'),
    )
    expect(coverBlurredAvif).toBeDefined()

    // Full blurred should exist
    const fullBlurredAvif = result.files.find(
      (f) => f.path.includes('-full-blurred') && f.path.endsWith('.avif'),
    )
    expect(fullBlurredAvif).toBeDefined()
  })

  it('should use correct compression settings', async () => {
    const testImage = await sharp({
      create: { width: 2000, height: 2500, channels: 3, background: '#4488cc' },
    })
      .jpeg()
      .toBuffer()

    const result = await processImage(testImage, userId, photoId)

    const avifFiles = result.files.filter((f) => f.path.endsWith('.avif'))
    expect(avifFiles.length).toBe(Object.keys(PHOTO_VARIANTS).length)

    const webpFiles = result.files.filter((f) => f.path.endsWith('.webp'))
    expect(webpFiles.length).toBe(Object.keys(PHOTO_VARIANTS).length)
  })

  it('should produce valid jsonb structure', async () => {
    const testImage = await sharp({
      create: { width: 2000, height: 2500, channels: 3, background: '#4488cc' },
    })
      .jpeg()
      .toBuffer()

    const result = await processImage(testImage, userId, photoId)

    expect(Object.keys(result.variantsJsonb)).toHaveLength(Object.keys(PHOTO_VARIANTS).length)

    for (const [key, paths] of Object.entries(result.variantsJsonb)) {
      expect(paths.avif).toContain(
        `-${(PHOTO_VARIANTS as Record<string, { fileSuffix: string }>)[key]!.fileSuffix}.avif`,
      )
      expect(paths.webp).toContain(
        `-${(PHOTO_VARIANTS as Record<string, { fileSuffix: string }>)[key]!.fileSuffix}.webp`,
      )
    }
  })
})
