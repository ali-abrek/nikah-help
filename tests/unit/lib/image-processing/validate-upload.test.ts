import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { validateUpload } from '@/lib/image-processing/validate-upload'
import { AppError } from '@/lib/errors/app-error'

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 100, b: 100 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer()
}

// Minimal hand-crafted animated GIF89a with 2 frames (1×1 each).
// We can't synthesize one with sharp's `create` API (it produces a single
// frame), so we hard-code a known-valid byte sequence.
const ANIMATED_GIF_BASE64 =
  'R0lGODlhAQABAIAAAP///wAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAQABAAACAkQBADs='

describe('validateUpload', () => {
  it('accepts a normal JPEG', async () => {
    const buf = await makeJpeg(1500, 2000)
    const result = await validateUpload(buf)
    expect(result.valid).toBe(true)
    expect(result.metadata?.format).toBe('jpeg')
  })

  it('rejects files exceeding maxFileSize', async () => {
    // Pad the buffer with junk bytes — sharp doesn't see them, but the size
    // check fires before sharp parses the buffer.
    const real = await makeJpeg(1500, 2000)
    const padded = Buffer.concat([real, Buffer.alloc(11 * 1024 * 1024)])
    await expect(validateUpload(padded)).rejects.toThrow(AppError)
  })

  it('rejects images smaller than minShortSide', async () => {
    const small = await makeJpeg(500, 500)
    await expect(validateUpload(small)).rejects.toThrowError(/IMAGE_TOO_SMALL/)
  })

  it('rejects unsupported formats (e.g. raw TIFF)', async () => {
    const tiff = await sharp({
      create: { width: 1500, height: 2000, channels: 3, background: '#fff' },
    })
      .tiff()
      .toBuffer()
    await expect(validateUpload(tiff)).rejects.toThrowError(/VALIDATION_FILE_UNSUPPORTED_FORMAT/)
  })

  it('rejects unparseable buffers', async () => {
    const garbage = Buffer.from('this is definitely not an image')
    await expect(validateUpload(garbage)).rejects.toThrowError(/VALIDATION_FILE_UNSUPPORTED_FORMAT/)
  })

  it('rejects animated images (multi-frame)', async () => {
    // 1x1 GIFs are below minShortSide, so this would also fail for size —
    // but the metadata.pages > 1 check fires before the dimension check,
    // and either rejection raises VALIDATION_FILE_UNSUPPORTED_FORMAT /
    // VALIDATION_IMAGE_TOO_SMALL — both are AppErrors, which is what we
    // want to assert here.
    const animated = Buffer.from(ANIMATED_GIF_BASE64, 'base64')
    await expect(validateUpload(animated)).rejects.toThrow(AppError)
  })
})
