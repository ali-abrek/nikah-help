import { UPLOAD } from './photo-variants'
import { AppError } from '@/lib/errors/app-error'
import sharp from 'sharp'

export interface ValidationResult {
  valid: boolean
  metadata?: sharp.Metadata
}

export async function validateUpload(buffer: Buffer): Promise<ValidationResult> {
  if (buffer.length > UPLOAD.maxFileSize) {
    throw new AppError('VALIDATION_FILE_TOO_LARGE', {
      logContext: { fileSize: buffer.length, maxSize: UPLOAD.maxFileSize },
    })
  }

  let metadata: sharp.Metadata
  try {
    metadata = await sharp(buffer).metadata()
  } catch {
    throw new AppError('VALIDATION_FILE_UNSUPPORTED_FORMAT', {
      logContext: { message: 'sharp could not parse the file' },
    })
  }

  const mimeType = `image/${metadata.format}`
  if (!UPLOAD.acceptedMimeTypes.includes(mimeType as typeof UPLOAD.acceptedMimeTypes[number])) {
    throw new AppError('VALIDATION_FILE_UNSUPPORTED_FORMAT', {
      logContext: { detectedFormat: metadata.format },
    })
  }

  const shortSide = Math.min(metadata.width ?? 0, metadata.height ?? 0)
  if (shortSide < UPLOAD.minShortSide) {
    throw new AppError('VALIDATION_IMAGE_TOO_SMALL', {
      logContext: {
        width: metadata.width,
        height: metadata.height,
        shortSide,
        minRequired: UPLOAD.minShortSide,
      },
    })
  }

  return { valid: true, metadata }
}
