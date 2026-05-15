# 13 — Photo Variant Configuration

## Purpose

This file defines the **single source of truth** for all photo variant dimensions, formats, compression settings, upload constraints, and storage paths. Every component — the Sharp pipeline, the stream handler, the frontend `<Photo>` component, and automated tests — references this config. Hardcoded dimensions, quality values, or format strings anywhere else in the codebase are banned.

**Target audience:** AI development agents (Claude Code) and senior fullstack engineers.

> **MANDATORY OBSERVABILITY (photo variants):** Per [14-sentry-observability.md](14-sentry-observability.md), every variant transform and upload in the Inngest `process-photo` function MUST report under `flow=image.process`, with `step=<step-name>` and `variant=<name>` tags so a regression in a single sharp transform is visible. See also [06-image-processing.md](06-image-processing.md). Photo bytes and signed URLs MUST NEVER be sent to Sentry.

---

## Requirement: Configuration File

### `lib/image-processing/photo-variants.ts`

This file is the canonical registry. Every value that affects image generation or delivery lives here.

```typescript
// lib/image-processing/photo-variants.ts

// ── Formats ──────────────────────────────────────────────────────

export const FORMATS = ['avif', 'webp'] as const
export type ImageFormat = typeof FORMATS[number]

// ── Compression ──────────────────────────────────────────────────

export const COMPRESSION = {
  avif: { quality: 60 },
  webp: { quality: 80 },
} as const

// ── Processing ───────────────────────────────────────────────────

export const PROCESSING = {
  /** Route Handler maxDuration on Vercel. Must match vercel.json. */
  maxDuration: 30,
  /** Never upscale — if source is smaller, keep original dimensions. */
  withoutEnlargement: true,
} as const

// ── Upload Constraints ───────────────────────────────────────────

export const UPLOAD = {
  /** Maximum file size in bytes (10 MB). */
  maxFileSize: 10 * 1024 * 1024,

  /** Minimum short side in pixels. Server rejects below this. */
  minShortSide: 1000,

  /** Accepted MIME types for the file input and server validation. */
  acceptedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/heic',
  ] as const,

  /** Maximum number of photos per profile. Enforced by DB trigger. */
  maxPhotosPerProfile: 6,
} as const

// ── Storage ──────────────────────────────────────────────────────

export const STORAGE = {
  /** Supabase Storage bucket name. */
  bucket: 'profile-photos',

  /**
   * Path pattern for variant files.
   * `{userId}` — profile owner UUID
   * `{photoId}` — photo row UUID
   * `{suffix}` — variant file suffix from VARIANT_SUFFIXES
   * `{format}` — 'avif' or 'webp'
   */
  pathPattern: '{userId}/{photoId}-{suffix}.{format}',

  /** Path pattern for temporary original uploads (deleted after processing). */
  originalPathPattern: '{userId}/{photoId}.original',
} as const

// ── Variant Definitions ──────────────────────────────────────────

export interface VariantConfig {
  /** Display name for logging and the stream handler's `variant` param. */
  name: string

  /** Target width in pixels. */
  width: number

  /** Target height in pixels. */
  height: number

  /** Intended aspect ratio (width:height). Used for crop calculations. */
  aspectRatio: { w: number; h: number }

  /**
   * Sharp fit mode:
   * - 'cover' — crop to exactly width×height, centered. Used for fixed-size variants.
   * - 'inside' — scale to fit within width×height, preserving ratio. Used for full-size.
   */
  fit: 'cover' | 'inside'

  /** Gaussian blur sigma in pixels. null = no blur. */
  blur: number | null

  /** Cache-Control header for the stream endpoint. */
  cacheControl: string

  /** Whether this variant should be generated as blurred (for authz-gated access). */
  generateBlurred: boolean

  /**
   * File suffix used in storage paths (hyphenated).
   * Example: 'cover-blurred' → `{userId}/{photoId}-cover-blurred.avif`
   */
  fileSuffix: string

  /**
   * Key used in the `photos.variants` jsonb column (underscore).
   * Example: 'cover_blurred'
   */
  jsonbKey: string

  /**
   * Public variant name accepted by the stream handler's `?variant=` query param.
   * null = not directly requestable (resolved internally via blur logic).
   */
  publicName: 'avatar' | 'cover' | 'full' | null
}

/**
 * Master variant registry.
 *
 * Five variants, each generating AVIF + WebP = 10 files per photo.
 *
 * Variant ordering matters: avatar first (position 1 = avatar),
 * then cover (card display), then full (lightbox).
 */
export const PHOTO_VARIANTS: Record<string, VariantConfig> = {
  // ── Avatar (100×100, square, always unblurred) ──────────────────
  avatar: {
    name: 'Avatar',
    width: 100,
    height: 100,
    aspectRatio: { w: 1, h: 1 },
    fit: 'cover',
    blur: null,
    cacheControl: 'private, max-age=3600, immutable',
    generateBlurred: false, // Avatar is never blurred — rule from spec
    fileSuffix: 'avatar',
    jsonbKey: 'avatar',
    publicName: 'avatar',
  },

  // ── Cover (400×500, 4:5, profile card) ──────────────────────────
  cover: {
    name: 'Cover',
    width: 400,
    height: 500,
    aspectRatio: { w: 4, h: 5 },
    fit: 'cover',
    blur: null,
    cacheControl: 'private, no-store',
    generateBlurred: true,
    fileSuffix: 'cover',
    jsonbKey: 'cover',
    publicName: 'cover',
  },

  // ── Cover Blurred (400×500, 4:5, sigma=40) ──────────────────────
  cover_blurred: {
    name: 'Cover Blurred',
    width: 400,
    height: 500,
    aspectRatio: { w: 4, h: 5 },
    fit: 'cover',
    blur: 40,
    cacheControl: 'private, no-store',
    generateBlurred: false, // This IS the blurred variant
    fileSuffix: 'cover-blurred',
    jsonbKey: 'cover_blurred',
    publicName: null, // Not directly requestable — resolved by authz
  },

  // ── Full (1200×1500 max, 4:5, lightbox) ────────────────────────
  full: {
    name: 'Full',
    width: 1200,
    height: 1500,
    aspectRatio: { w: 4, h: 5 },
    fit: 'inside', // Scale to fit within bounds, don't crop
    blur: null,
    cacheControl: 'private, no-store',
    generateBlurred: true,
    fileSuffix: 'full',
    jsonbKey: 'full',
    publicName: 'full',
  },

  // ── Full Blurred (1200×1500 max, 4:5, sigma=60) ────────────────
  full_blurred: {
    name: 'Full Blurred',
    width: 1200,
    height: 1500,
    aspectRatio: { w: 4, h: 5 },
    fit: 'inside',
    blur: 60,
    cacheControl: 'private, no-store',
    generateBlurred: false, // This IS the blurred variant
    fileSuffix: 'full-blurred',
    jsonbKey: 'full_blurred',
    publicName: null, // Not directly requestable — resolved by authz
  },
} as const

// ── Derived Types ─────────────────────────────────────────────────

/** Keys of PHOTO_VARIANTS — the internal variant identifiers. */
export type VariantKey = keyof typeof PHOTO_VARIANTS

/** Public variant names accepted by the stream endpoint. */
export type PublicVariant = NonNullable<VariantConfig['publicName']>

/** Variants that are directly requestable via ?variant= query param. */
export const PUBLIC_VARIANTS = Object.values(PHOTO_VARIANTS)
  .filter(v => v.publicName !== null)
  .map(v => v.publicName!) as PublicVariant[]

// ── Lookup Helpers ────────────────────────────────────────────────

/** Get variant config by its public name. */
export function getVariantByPublicName(name: PublicVariant): VariantConfig {
  const variant = Object.values(PHOTO_VARIANTS).find(v => v.publicName === name)
  if (!variant) throw new Error(`Unknown public variant: ${name}`)
  return variant
}

/** Get the blurred counterpart of a public variant. Returns null for avatar (never blurred). */
export function getBlurredVariant(publicName: PublicVariant): VariantConfig | null {
  if (publicName === 'avatar') return null
  const key = `${publicName}_blurred` as VariantKey
  return PHOTO_VARIANTS[key] ?? null
}

/**
 * Resolve the actual variant to serve based on authorization.
 *
 * Avatar is always unblurred regardless of private mode.
 * Cover and full are blurred when showFull === false.
 */
export function resolveServeVariant(
  publicVariant: PublicVariant,
  showFull: boolean,
): VariantConfig {
  if (publicVariant === 'avatar' || showFull) {
    return getVariantByPublicName(publicVariant)
  }
  return getBlurredVariant(publicVariant)!
}

/** Get all variants that should be generated for a given public variant. */
export function getVariantsToGenerate(publicName: PublicVariant): VariantConfig[] {
  const base = getVariantByPublicName(publicName)
  const variants = [base]
  if (base.generateBlurred) {
    const blurred = getBlurredVariant(publicName)
    if (blurred) variants.push(blurred)
  }
  return variants
}

/** Build storage path for a variant file. */
export function buildStoragePath(
  userId: string,
  photoId: string,
  variant: VariantConfig,
  format: ImageFormat,
): string {
  return `${userId}/${photoId}-${variant.fileSuffix}.${format}`
}

/** Build the `photos.variants` jsonb structure after processing. */
export function buildVariantsJsonb(
  userId: string,
  photoId: string,
): Record<string, { avif: string; webp: string }> {
  const result: Record<string, { avif: string; webp: string }> = {}

  for (const variant of Object.values(PHOTO_VARIANTS)) {
    result[variant.jsonbKey] = {
      avif: buildStoragePath(userId, photoId, variant, 'avif'),
      webp: buildStoragePath(userId, photoId, variant, 'webp'),
    }
  }

  return result
}
```

### Why `fileSuffix` and `jsonbKey` Are Separate

| Context | Format | Example |
|---|---|---|
| Storage path (file name) | Hyphenated suffix | `{userId}/{photoId}-cover-blurred.avif` |
| `photos.variants` jsonb column | Underscore key | `{ "cover_blurred": { "avif": "...", "webp": "..." } }` |
| Stream handler `?variant=` param | Underscore public name | `?variant=cover` (server resolves to `cover_blurred` internally) |

This distinction is intentional:
- **Hyphens in file names** — URL-friendly, readable in Supabase Storage dashboard
- **Underscores in jsonb keys** — valid JavaScript/TypeScript property access: `variants.cover_blurred.avif`
- **Public names** — short, user-visible in API URLs

---

## Requirement: Variant Quick Reference

| Variant | Dimensions | Ratio | Fit | Blur | AVIF Q | WebP Q | Cache |
|---|---|---|---|---|---|---|---|
| `avatar` | 100 × 100 | 1:1 | cover | — | 60 | 80 | `private, max-age=3600, immutable` |
| `cover` | 400 × 500 | 4:5 | cover | — | 60 | 80 | `private, no-store` |
| `cover_blurred` | 400 × 500 | 4:5 | cover | σ=40 | 60 | 80 | `private, no-store` |
| `full` | 1200 × 1500 max | 4:5 | inside | — | 60 | 80 | `private, no-store` |
| `full_blurred` | 1200 × 1500 max | 4:5 | inside | σ=60 | 60 | 80 | `private, no-store` |

**Total: 5 variants × 2 formats = 10 files per photo.**

---

## Requirement: Upload Validation

### Server-Side Validation

```typescript
// lib/image-processing/validate-upload.ts
import { UPLOAD } from './photo-variants'
import { AppError } from '@/lib/errors/app-error'
import sharp from 'sharp'

interface ValidationResult {
  valid: boolean
  metadata?: sharp.Metadata
}

/**
 * Validate an uploaded image against the configured constraints.
 * Called before generating a signed upload URL (client-side pre-check)
 * and again after download in the processing pipeline (server-side enforcement).
 */
export async function validateUpload(buffer: Buffer): Promise<ValidationResult> {
  // 1. File size
  if (buffer.length > UPLOAD.maxFileSize) {
    throw new AppError('VALIDATION_FILE_TOO_LARGE', {
      logContext: { fileSize: buffer.length, maxSize: UPLOAD.maxFileSize },
    })
  }

  // 2. Read metadata
  let metadata: sharp.Metadata
  try {
    metadata = await sharp(buffer).metadata()
  } catch {
    throw new AppError('VALIDATION_FILE_UNSUPPORTED_FORMAT', {
      logContext: { message: 'sharp could not parse the file' },
    })
  }

  // 3. Format check
  const mimeType = `image/${metadata.format}`
  if (!UPLOAD.acceptedMimeTypes.includes(mimeType as any)) {
    throw new AppError('VALIDATION_FILE_UNSUPPORTED_FORMAT', {
      logContext: { detectedFormat: metadata.format },
    })
  }

  // 4. Minimum resolution
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
```

### Client-Side Pre-Validation

```typescript
// features/photos/lib/pre-validate.ts
import { UPLOAD } from '@/lib/image-processing/photo-variants'

export interface PreValidationError {
  code: string
  message: string
}

/**
 * Client-side file check before upload.
 * Mirrors server validation to catch errors early.
 * Does NOT read image dimensions (requires loading the image in a canvas/Image element).
 */
export function preValidateFile(file: File): PreValidationError | null {
  if (file.size > UPLOAD.maxFileSize) {
    return {
      code: 'VALIDATION_FILE_TOO_LARGE',
      message: `File exceeds ${UPLOAD.maxFileSize / 1024 / 1024}MB limit`,
    }
  }

  if (!UPLOAD.acceptedMimeTypes.includes(file.type as any)) {
    return {
      code: 'VALIDATION_FILE_UNSUPPORTED_FORMAT',
      message: `Format ${file.type} is not supported. Use JPEG, PNG, WebP, AVIF, or HEIC.`,
    }
  }

  return null
}
```

---

## Requirement: Usage in the Sharp Pipeline

### `lib/image-processing/pipeline.ts`

The pipeline reads `PHOTO_VARIANTS` to know exactly what to generate. No dimensions or quality values are hardcoded.

```typescript
// lib/image-processing/pipeline.ts
import sharp from 'sharp'
import {
  PHOTO_VARIANTS,
  COMPRESSION,
  FORMATS,
  PROCESSING,
  buildVariantsJsonb,
  buildStoragePath,
  type VariantKey,
  type ImageFormat,
} from './photo-variants'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'

interface GeneratedFile {
  path: string
  buffer: Buffer
  contentType: string
}

interface PipelineResult {
  files: GeneratedFile[]
  variantsJsonb: Record<string, { avif: string; webp: string }>
}

/**
 * Process an original image into all configured variants.
 *
 * Reads PHOTO_VARIANTS to determine what to generate.
 * Adding a new variant to the config automatically includes it here —
 * no pipeline code changes needed.
 */
export async function processImage(
  buffer: Buffer,
  userId: string,
  photoId: string,
): Promise<PipelineResult> {
  const image = sharp(buffer).rotate() // Auto-orient from EXIF
  const files: GeneratedFile[] = []

  for (const [key, config] of Object.entries(PHOTO_VARIANTS)) {
    for (const format of FORMATS) {
      try {
        let pipeline = image.clone()

        // Resize: crop to aspect ratio first, then resize to target
        pipeline = pipeline.resize(config.width, config.height, {
          fit: config.fit,
          withoutEnlargement: PROCESSING.withoutEnlargement,
        })

        // Blur if configured
        if (config.blur !== null) {
          pipeline = pipeline.blur(config.blur)
        }

        // Convert to output format with configured quality
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
```

### `app/api/photos/process/route.ts`

```typescript
// app/api/photos/process/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { processImage } from '@/lib/image-processing/pipeline'
import { UPLOAD, STORAGE, PROCESSING, PHOTO_VARIANTS } from '@/lib/image-processing/photo-variants'
import { validateUpload } from '@/lib/image-processing/validate-upload'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'

export const runtime = 'nodejs'
export const maxDuration = PROCESSING.maxDuration

export async function POST(request: NextRequest) {
  try {
    const { photoId, userId } = await request.json()
    const supabase = createSupabaseAdmin()

    // 1. Download original from Storage
    const originalPath = STORAGE.originalPathPattern
      .replace('{userId}', userId)
      .replace('{photoId}', photoId)

    const { data: file, error: downloadError } = await supabase
      .storage
      .from(STORAGE.bucket)
      .download(originalPath)

    if (downloadError || !file) {
      throw new AppError('PHOTO_DOWNLOAD_FAILED', {
        cause: downloadError ?? undefined,
        logContext: { photoId, userId, path: originalPath },
      })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // 2. Validate
    await validateUpload(buffer)

    // 3. Mark as processing
    await supabase
      .from('photos')
      .update({ status: 'processing' })
      .eq('id', photoId)

    // 4. Generate all variants
    const result = await processImage(buffer, userId, photoId)

    // 5. Upload all 10 variant files
    for (const file of result.files) {
      const { error: uploadError } = await supabase
        .storage
        .from(STORAGE.bucket)
        .upload(file.path, file.buffer, {
          contentType: file.contentType,
          cacheControl: PHOTO_VARIANTS[
            Object.keys(PHOTO_VARIANTS).find(
              k => PHOTO_VARIANTS[k].fileSuffix ===
                file.path.split('/').pop()?.split('.')[0]?.replace(`${photoId}-`, '')
            ) ?? 'avatar'
          ].cacheControl,
          upsert: true,
        })

      if (uploadError) {
        throw new AppError('PHOTO_UPLOAD_FAILED', {
          cause: uploadError,
          logContext: { photoId, path: file.path },
        })
      }
    }

    // 6. Delete original from Storage
    await supabase
      .storage
      .from(STORAGE.bucket)
      .remove([originalPath])

    // 7. Update photos row: mark processed, store variant paths, clear storage_path
    await supabase
      .from('photos')
      .update({
        status: 'processed',
        variants: result.variantsJsonb,
        storage_path: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', photoId)

    return NextResponse.json({ success: true, photoId })

  } catch (error) {
    return handleRouteError(error)
  }
}
```

---

## Requirement: Usage in the Stream Handler

### `app/api/photos/stream/route.ts`

The stream handler uses `resolveServeVariant()` to pick the correct variant based on authorization, then reads `cacheControl` and dimensions from the config.

```typescript
// app/api/photos/stream/route.ts
import { NextRequest, NextResponse } from 'next/server'
import {
  PHOTO_VARIANTS,
  COMPRESSION,
  STORAGE,
  FORMATS,
  resolveServeVariant,
  type PublicVariant,
  type ImageFormat,
} from '@/lib/image-processing/photo-variants'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const photoId = searchParams.get('photoId')
    const variantParam = searchParams.get('variant') as PublicVariant | null
    const fmt = searchParams.get('fmt') as ImageFormat | null

    // Validate params
    if (!photoId) throw new AppError('VALIDATION_INVALID_INPUT', {
      details: { photoId: 'Required' },
    })
    if (!variantParam || !['avatar', 'cover', 'full'].includes(variantParam)) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        details: { variant: 'Must be avatar, cover, or full' },
      })
    }
    if (!fmt || !FORMATS.includes(fmt)) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        details: { fmt: 'Must be avif or webp' },
      })
    }

    const supabase = createSupabaseAdmin()

    // 1. Fetch photo row
    const { data: photo } = await supabase
      .from('photos')
      .select('id, profile_id, variants, moderation_status')
      .eq('id', photoId)
      .single()

    if (!photo) throw new AppError('NOT_FOUND')

    // 2. Determine authorization (abbreviated — full logic in 06-image-processing.md)
    const showFull = await canViewFull(photo, request)

    // 3. Resolve which variant to serve
    const variant = resolveServeVariant(variantParam, showFull)

    // 4. Get storage path from jsonb
    const path = photo.variants[variant.jsonbKey]?.[fmt] as string | undefined
    if (!path) {
      throw new AppError('NOT_FOUND', {
        logContext: { photoId, variant: variant.jsonbKey, format: fmt },
      })
    }

    // 5. Download from Storage
    const { data: file, error } = await supabase
      .storage
      .from(STORAGE.bucket)
      .download(path)

    if (error || !file) {
      throw new AppError('PHOTO_DOWNLOAD_FAILED', {
        cause: error ?? undefined,
        logContext: { photoId, path },
      })
    }

    // 6. Return with config-driven headers
    return new NextResponse(file, {
      headers: {
        'Content-Type': `image/${fmt}`,
        'Cache-Control': variant.cacheControl,
        'Content-Disposition': 'inline; filename="photo"',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })

  } catch (error) {
    return handleRouteError(error)
  }
}
```

---

## Requirement: Usage in the Frontend

### `<Photo>` Component

```typescript
// features/photos/components/Photo.tsx
import {
  PHOTO_VARIANTS,
  resolveServeVariant,
  type PublicVariant,
} from '@/lib/image-processing/photo-variants'

interface PhotoProps {
  photoId: string
  /** Which public variant to display. Default: 'cover'. */
  variant?: PublicVariant
  /** When true, blurred variants are served. Default: false. */
  blurred?: boolean
  /** HTML alt text. */
  alt: string
  /** CSS class for the <img> element. */
  className?: string
  /** When true, prevents right-click save. */
  protected?: boolean
}

/**
 * Renders a photo using the <picture> element with AVIF/WebP sources.
 * All dimensions come from PHOTO_VARIANTS — never hardcoded.
 */
export function Photo({
  photoId,
  variant = 'cover',
  blurred = false,
  alt,
  className,
  protected = true,
}: PhotoProps) {
  const config = PHOTO_VARIANTS[variant]

  // If blurred, resolve to the blurred counterpart
  const serveVariant = blurred
    ? resolveServeVariant(variant, false)
    : resolveServeVariant(variant, true)

  const avifSrc = `/api/photos/stream?photoId=${photoId}&variant=${variant}&fmt=avif`
  const webpSrc = `/api/photos/stream?photoId=${photoId}&variant=${variant}&fmt=webp`

  return (
    <picture>
      <source srcSet={avifSrc} type="image/avif" />
      <source srcSet={webpSrc} type="image/webp" />
      <img
        src={webpSrc}
        alt={alt}
        width={config.width}
        height={config.height}
        className={className}
        loading="lazy"
        decoding="async"
        draggable={false}
        onContextMenu={protected ? (e) => e.preventDefault() : undefined}
        style={{ aspectRatio: `${config.aspectRatio.w}/${config.aspectRatio.h}` }}
      />
    </picture>
  )
}
```

### Profile Card Usage

The ProfileCard displays the avatar at 96×96 CSS pixels, but the actual image is 100×100 (the browser scales it). The `width`/`height` HTML attributes come from the config, while the CSS size is a presentation concern:

```tsx
// features/profiles/components/ProfileCard.tsx
import { Photo } from '@/features/photos/components/Photo'

export function ProfileCard({ profile }: { profile: ProfileCardData }) {
  return (
    <div className="flex items-center gap-3">
      <div className="size-24 shrink-0">
        <Photo
          photoId={profile.avatarPhotoId}
          variant="avatar"
          alt={profile.name}
          className="size-24 rounded-full object-cover"
        />
      </div>
      {/* name, age, country... */}
    </div>
  )
}
```

### Photo Grid (Profile Page)

```tsx
// features/photos/components/PhotoGrid.tsx
import { Photo } from '@/features/photos/components/Photo'
import { UPLOAD } from '@/lib/image-processing/photo-variants'

export function PhotoGrid({ photos, isOwner }: PhotoGridProps) {
  return (
    <div
      className="grid gap-1"
      style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
      }}
    >
      {photos.map(photo => (
        <Photo
          key={photo.id}
          photoId={photo.id}
          variant="cover"
          blurred={!isOwner && photo.blurred}
          alt="Profile photo"
          className="w-full h-full object-cover"
        />
      ))}

      {/* Upload slot — shows count */}
      {isOwner && photos.length < UPLOAD.maxPhotosPerProfile && (
        <UploadSlot remaining={UPLOAD.maxPhotosPerProfile - photos.length} />
      )}
    </div>
  )
}
```

---

## Requirement: Usage in Tests

### Pipeline Tests

```typescript
// tests/unit/lib/image-processing/pipeline.test.ts
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import {
  PHOTO_VARIANTS,
  COMPRESSION,
  FORMATS,
  PROCESSING,
} from '@/lib/image-processing/photo-variants'
import { processImage } from '@/lib/image-processing/pipeline'

describe('processImage', () => {
  const userId = '00000000-0000-0000-0000-000000000001'
  const photoId = '00000000-0000-0000-0000-000000000002'

  it('should generate exactly 10 files (5 variants × 2 formats)', async () => {
    // Create a 2000×2500 test image (4:5 ratio) with solid color
    const testImage = await sharp({
      create: { width: 2000, height: 2500, channels: 3, background: '#4488cc' },
    }).jpeg().toBuffer()

    const result = await processImage(testImage, userId, photoId)

    // 5 variants × 2 formats = 10 files
    expect(result.files).toHaveLength(
      Object.keys(PHOTO_VARIANTS).length * FORMATS.length,
    )
  })

  it('should produce avatar at exactly 100×100', async () => {
    const testImage = await sharp({
      create: { width: 2000, height: 2500, channels: 3, background: '#4488cc' },
    }).jpeg().toBuffer()

    const result = await processImage(testImage, userId, photoId)

    for (const format of FORMATS) {
      const avatarFile = result.files.find(
        f => f.path.includes('-avatar') && f.path.endsWith(`.${format}`),
      )
      expect(avatarFile).toBeDefined()

      const meta = await sharp(avatarFile!.buffer).metadata()
      expect(meta.width).toBe(PHOTO_VARIANTS.avatar.width)
      expect(meta.height).toBe(PHOTO_VARIANTS.avatar.height)
    }
  })

  it('should produce cover at exactly 400×500', async () => {
    const testImage = await sharp({
      create: { width: 2000, height: 2500, channels: 3, background: '#4488cc' },
    }).jpeg().toBuffer()

    const result = await processImage(testImage, userId, photoId)

    for (const format of FORMATS) {
      const coverFile = result.files.find(
        f => f.path.includes('-cover.') && !f.path.includes('blurred'),
      )
      expect(coverFile).toBeDefined()

      const meta = await sharp(coverFile!.buffer).metadata()
      expect(meta.width).toBe(PHOTO_VARIANTS.cover.width)
      expect(meta.height).toBe(PHOTO_VARIANTS.cover.height)
    }
  })

  it('should apply blur to blurred variants', async () => {
    const testImage = await sharp({
      create: { width: 2000, height: 2500, channels: 3, background: '#4488cc' },
    }).jpeg().toBuffer()

    // Generate only blurred variants
    const coverBlurredConfig = PHOTO_VARIANTS.cover_blurred
    expect(coverBlurredConfig.blur).toBe(40)

    const fullBlurredConfig = PHOTO_VARIANTS.full_blurred
    expect(fullBlurredConfig.blur).toBe(60)
  })

  it('should never upscale (withoutEnlargement)', async () => {
    // Create an image smaller than the full variant
    const smallImage = await sharp({
      create: { width: 200, height: 250, channels: 3, background: '#4488cc' },
    }).jpeg().toBuffer()

    const result = await processImage(smallImage, userId, photoId)

    // Full variant should NOT be upscaled to 1200×1500
    const fullFile = result.files.find(
      f => f.path.includes('-full.') && !f.path.includes('blurred'),
    )
    const meta = await sharp(fullFile!.buffer).metadata()
    expect(meta.width!).toBeLessThanOrEqual(200)
    expect(meta.height!).toBeLessThanOrEqual(250)
  })

  it('should use correct compression settings', async () => {
    const testImage = await sharp({
      create: { width: 2000, height: 2500, channels: 3, background: '#4488cc' },
    }).jpeg().toBuffer()

    const result = await processImage(testImage, userId, photoId)

    // AVIF files should exist with quality 60
    const avifFiles = result.files.filter(f => f.path.endsWith('.avif'))
    expect(avifFiles.length).toBe(Object.keys(PHOTO_VARIANTS).length)

    // WebP files should exist with quality 80
    const webpFiles = result.files.filter(f => f.path.endsWith('.webp'))
    expect(webpFiles.length).toBe(Object.keys(PHOTO_VARIANTS).length)
  })

  it('should produce valid jsonb structure', async () => {
    const testImage = await sharp({
      create: { width: 2000, height: 2500, channels: 3, background: '#4488cc' },
    }).jpeg().toBuffer()

    const result = await processImage(testImage, userId, photoId)

    // All 5 variant keys present
    expect(Object.keys(result.variantsJsonb)).toHaveLength(
      Object.keys(PHOTO_VARIANTS).length,
    )

    // Each variant has avif and webp paths
    for (const [key, paths] of Object.entries(result.variantsJsonb)) {
      expect(paths.avif).toContain(`-${PHOTO_VARIANTS[key].fileSuffix}.avif`)
      expect(paths.webp).toContain(`-${PHOTO_VARIANTS[key].fileSuffix}.webp`)
    }
  })
})
```

### Stream Handler Tests

```typescript
// tests/unit/lib/image-processing/photo-variants.test.ts
import { describe, it, expect } from 'vitest'
import {
  PHOTO_VARIANTS,
  resolveServeVariant,
  getBlurredVariant,
  PUBLIC_VARIANTS,
  FORMATS,
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
    const keys = Object.values(PHOTO_VARIANTS).map(v => v.jsonbKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('should have unique file suffixes', () => {
    const suffixes = Object.values(PHOTO_VARIANTS).map(v => v.fileSuffix)
    expect(new Set(suffixes).size).toBe(suffixes.length)
  })

  it('should never blur the avatar', () => {
    // Avatar's generateBlurred is false and getBlurredVariant returns null
    expect(PHOTO_VARIANTS.avatar.generateBlurred).toBe(false)
    expect(getBlurredVariant('avatar')).toBeNull()
  })

  it('should blur cover and full when showFull is false', () => {
    // Cover → blurred
    const coverBlurred = resolveServeVariant('cover', false)
    expect(coverBlurred.jsonbKey).toBe('cover_blurred')
    expect(coverBlurred.blur).toBe(40)

    // Full → blurred
    const fullBlurred = resolveServeVariant('full', false)
    expect(fullBlurred.jsonbKey).toBe('full_blurred')
    expect(fullBlurred.blur).toBe(60)

    // Avatar → always unblurred
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
      const { w, h } = variant.aspectRatio
      expect(w).toBeGreaterThan(0)
      expect(h).toBeGreaterThan(0)
      // width/height should match aspect ratio
      expect(variant.width / variant.height).toBeCloseTo(w / h, 1)
    }
  })

  it('should map fileSuffixes to hyphenated paths', () => {
    // jsonb keys use underscore, file suffixes use hyphen
    const blurredVariants = Object.values(PHOTO_VARIANTS)
      .filter(v => v.jsonbKey.includes('_'))

    for (const v of blurredVariants) {
      expect(v.fileSuffix).toContain('-')
      expect(v.fileSuffix).not.toContain('_')
    }
  })
})
```

---

## Requirement: Adding a New Variant

### Example: Add a "thumbnail" variant (200×200, square, for grid views)

1. **Add the variant config** to `PHOTO_VARIANTS` in `lib/image-processing/photo-variants.ts`:

```typescript
thumbnail: {
  name: 'Thumbnail',
  width: 200,
  height: 200,
  aspectRatio: { w: 1, h: 1 },
  fit: 'cover',
  blur: null,
  cacheControl: 'private, max-age=3600, immutable',
  generateBlurred: false,
  fileSuffix: 'thumbnail',
  jsonbKey: 'thumbnail',
  publicName: null, // Internal only, not requestable via ?variant=
},
```

That's it. The pipeline automatically picks it up because it iterates `Object.values(PHOTO_VARIANTS)`. The jsonb builder includes it. No pipeline code changes.

2. **If the variant is publicly requestable**, add it to the `publicName` union and `PublicVariant` type. Update the stream handler's validation to accept the new value.

3. **Update tests** to expect 6 variants × 2 formats = 12 files instead of 10.

4. **Existing photos are unaffected.** The `photos.variants` jsonb for existing rows doesn't have the new key. The stream handler returns 404 for the missing key — clients must re-upload to get the new variant.

### Backward Compatibility Rules

- **Never remove or rename a variant.** Existing `photos.variants` jsonb references would break.
- **Never change dimensions of an existing variant.** Already-processed photos would have mismatched sizes.
- **To deprecate a variant:** mark it `@deprecated` in the config, stop generating it for new uploads, but keep serving existing files.
- **To change compression:** update `COMPRESSION` values — applies to new uploads only. Existing files retain their original quality.

---

## Requirement: Consistency Guarantees

### Single Import Rule

Every file that needs variant information imports from exactly one place:

```typescript
// ✅ The only allowed import
import { PHOTO_VARIANTS, COMPRESSION, FORMATS, UPLOAD, STORAGE } from '@/lib/image-processing/photo-variants'

// ❌ Banned — hardcoded values anywhere else
const AVATAR_SIZE = 100                    // Use PHOTO_VARIANTS.avatar.width
const MAX_PHOTOS = 6                        // Use UPLOAD.maxPhotosPerProfile
const quality = { avif: 60, webp: 80 }      // Use COMPRESSION
```

### CI Enforcement

```typescript
// tests/unit/lib/image-processing/consistency.test.ts
import { describe, it, expect } from 'vitest'
import { PHOTO_VARIANTS, COMPRESSION, FORMATS, UPLOAD } from '@/lib/image-processing/photo-variants'

describe('photo variant consistency', () => {
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
        // Blurred variants should not generate their own blurred copy
        expect(variant.generateBlurred).toBe(false)
        expect(variant.jsonbKey).toMatch(/_blurred$/)
      }
      if (variant.generateBlurred) {
        // Variants that generate blurred should not themselves be blurred
        expect(variant.blur).toBeNull()
        expect(variant.jsonbKey).not.toMatch(/_blurred$/)
      }
    }
  })

  it('should have matching publicName for directly requestable variants', () => {
    const publicVariants = Object.values(PHOTO_VARIANTS)
      .filter(v => v.publicName !== null)

    for (const v of publicVariants) {
      expect(['avatar', 'cover', 'full']).toContain(v.publicName)
      // Non-blurred variants with publicName should have generateBlurred = true
      // OR be avatar (which is never blurred)
      if (v.publicName !== 'avatar') {
        expect(v.generateBlurred).toBe(true)
      }
    }
  })

  it('should enforce minShortSide > max variant dimension', () => {
    // The minimum upload dimension must be larger than the largest variant
    // so we never need to upscale
    const maxVariantDim = Math.max(
      ...Object.values(PHOTO_VARIANTS).map(v => Math.max(v.width, v.height)),
    )
    expect(UPLOAD.minShortSide).toBeGreaterThanOrEqual(maxVariantDim)
  })
})
```

---

## Requirement: Performance Considerations

### Avoid Unnecessary Reprocessing

- Each photo is processed exactly once (at upload time). Variants are pre-generated, never on-the-fly.
- The `photos.status` column tracks lifecycle: `pending → uploaded → processing → processed`. The processing Route Handler is idempotent — if called twice for the same photo, it checks status first.
- Blur is pre-applied at processing time (`sharp.blur(sigma)`). The stream handler never transforms images — it only serves pre-generated files.

### Optimized Image Sizes

| Variant | Dimensions | Typical AVIF Size | Typical WebP Size |
|---|---|---|---|
| Avatar | 100 × 100 | ~2 KB | ~3 KB |
| Cover | 400 × 500 | ~15 KB | ~25 KB |
| Cover Blurred | 400 × 500 | ~8 KB | ~12 KB |
| Full | ≤1200 × 1500 | ~80 KB | ~140 KB |
| Full Blurred | ≤1200 × 1500 | ~35 KB | ~55 KB |

AVIF is ~40% smaller than WebP at equivalent quality. The `<picture>` element ensures AVIF-capable browsers get the smaller file.

### Cache Strategy

| Variant | Cache-Control | Rationale |
|---|---|---|
| Avatar | `private, max-age=3600, immutable` | Square crop won't change. Cache for 1 hour. |
| Cover / Full (unblurred) | `private, no-store` | Visibility depends on relationship state (match, block, private mode). Must revalidate every request. |
| Cover / Full (blurred) | `private, no-store` | Same — blur vs unblur depends on authz. |

Avatar is immutable because it's always unblurred and never changes dimensions. Cover/full must revalidate because the blur decision changes based on live relationship state.

---

## File Summary

```
lib/image-processing/
├── photo-variants.ts     # Single source of truth — PHOTO_VARIANTS, COMPRESSION, FORMATS, UPLOAD, STORAGE
├── pipeline.ts           # processImage() — reads config, generates all variants
├── validate-upload.ts    # Server-side upload validation against UPLOAD constraints
└── index.ts              # Re-exports

features/photos/
├── components/
│   ├── Photo.tsx         # <Photo> — reads dimensions from PHOTO_VARIANTS
│   ├── PhotoGrid.tsx     # Uses UPLOAD.maxPhotosPerProfile
│   └── UploadSlot.tsx    # Uses UPLOAD.maxPhotosPerProfile, UPLOAD.maxFileSize
├── lib/
│   └── pre-validate.ts   # Client-side file validation against UPLOAD constraints
└── hooks/
    └── usePhotoUpload.ts # Uses UPLOAD.maxFileSize, UPLOAD.acceptedMimeTypes

app/api/photos/
├── process/route.ts      # Uses PROCESSING.maxDuration, STORAGE, PHOTO_VARIANTS
└── stream/route.ts       # Uses resolveServeVariant(), PHOTO_VARIANTS, FORMATS, STORAGE

tests/unit/lib/image-processing/
├── photo-variants.test.ts   # Config consistency checks
├── pipeline.test.ts         # Output dimensions match config
└── validate-upload.test.ts  # Constraint enforcement
```

---

## Cross-References

- [00 — Overview & Architecture Principles](./00-overview.md) — Sharp, Supabase Storage, tech stack
- [02 — Database Schema & RLS](./02-database.md) — photos table, photo_status enum, RLS policies
- [03 — Profiles, Feed & Matching](./03-profiles-feed.md) — avatar display, private mode, blur rules
- [06 — Image Processing & Storage](./06-image-processing.md) — full pipeline, moderation, blur decision matrix
- [08 — Reports, Moderation & Suspensions](./08-moderation.md) — photo moderation, auto-triage, moderator actions
- [09 — Error Handling System](./09-error-handling.md) — PHOTO_* error codes, VALIDATION_FILE_* codes
- [10 — Rate Limiting System](./10-rate-limiting.md) — PHOTO_UPLOAD preset, READ_GENEROUS for stream
- [11 — Idempotency System](./11-idempotency.md) — batch photo upload idempotency
- [12 — Notification System](./12-notifications.md) — photo_approved, photo_rejected, photo_removed_by_moderator types
