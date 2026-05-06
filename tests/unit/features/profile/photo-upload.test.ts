import { describe, it, expect } from 'vitest'

const VALID_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'heif']

function validatePhotoUpload(filename: string, position: number) {
  const errors: string[] = []

  if (!filename || typeof filename !== 'string') {
    errors.push('filename is required')
  }

  const ext = filename.split('.').pop()?.toLowerCase()
  if (!ext || !VALID_EXTENSIONS.includes(ext)) {
    errors.push(`Invalid file type: ${ext}`)
  }

  if (typeof position !== 'number' || position < 1 || position > 6) {
    errors.push('position must be between 1 and 6')
  }

  return errors
}

describe('photo upload validation', () => {
  it('accepts valid JPEG filename at position 1', () => {
    const errors = validatePhotoUpload('photo.jpg', 1)
    expect(errors).toHaveLength(0)
  })

  it('accepts valid PNG at position 6', () => {
    const errors = validatePhotoUpload('avatar.png', 6)
    expect(errors).toHaveLength(0)
  })

  it('accepts webp', () => {
    const errors = validatePhotoUpload('img.webp', 3)
    expect(errors).toHaveLength(0)
  })

  it('accepts avif', () => {
    const errors = validatePhotoUpload('img.avif', 2)
    expect(errors).toHaveLength(0)
  })

  it('accepts heic', () => {
    const errors = validatePhotoUpload('photo.heic', 1)
    expect(errors).toHaveLength(0)
  })

  it('rejects invalid extension', () => {
    const errors = validatePhotoUpload('photo.gif', 1)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('Invalid file type')
  })

  it('rejects pdf files', () => {
    const errors = validatePhotoUpload('doc.pdf', 1)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects no extension', () => {
    const errors = validatePhotoUpload('photo', 1)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects position below 1', () => {
    const errors = validatePhotoUpload('photo.jpg', 0)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('position')
  })

  it('rejects position above 6', () => {
    const errors = validatePhotoUpload('photo.jpg', 7)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects empty filename', () => {
    const errors = validatePhotoUpload('', 1)
    expect(errors.length).toBeGreaterThan(0)
  })
})
