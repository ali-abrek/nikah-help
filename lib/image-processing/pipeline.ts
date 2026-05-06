import sharp from 'sharp'
import {
  PHOTO_VARIANTS,
  COMPRESSION,
  FORMATS,
  PROCESSING,
  buildVariantsJsonb,
  buildStoragePath,
} from './photo-variants'
import { AppError } from '@/lib/errors/app-error'

export interface GeneratedFile {
  path: string
  buffer: Buffer
  contentType: string
}

export interface PipelineResult {
  files: GeneratedFile[]
  variantsJsonb: Record<string, { avif: string; webp: string }>
}

export async function processImage(
  buffer: Buffer,
  userId: string,
  photoId: string,
): Promise<PipelineResult> {
  const image = sharp(buffer).rotate()
  const files: GeneratedFile[] = []

  for (const [key, config] of Object.entries(PHOTO_VARIANTS)) {
    for (const format of FORMATS) {
      try {
        let pipeline = image.clone()

        pipeline = pipeline.resize(config.width, config.height, {
          fit: config.fit,
          withoutEnlargement: PROCESSING.withoutEnlargement,
        })

        if (config.blur !== null) {
          pipeline = pipeline.blur(config.blur)
        }

        pipeline = pipeline.toFormat(format, COMPRESSION[format])

        const outputBuffer = await pipeline.toBuffer()

        files.push({
          path: buildStoragePath(userId, photoId, config, format),
          buffer: outputBuffer,
          contentType: `image/${format}`,
        })
      } catch (error) {
        throw new AppError('PHOTO_PROCESSING_FAILED', {
          cause: error instanceof Error ? error : undefined,
          logContext: {
            variant: key,
            format,
            photoId,
            userId,
          },
        })
      }
    }
  }

  return {
    files,
    variantsJsonb: buildVariantsJsonb(userId, photoId),
  }
}
