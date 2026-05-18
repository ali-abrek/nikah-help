// ── Formats ──────────────────────────────────────────────────────

export const FORMATS = ['avif', 'webp'] as const
export type ImageFormat = (typeof FORMATS)[number]

// ── Compression ──────────────────────────────────────────────────

export const COMPRESSION = {
  avif: { quality: 60 },
  webp: { quality: 80 },
} as const

// ── Processing ───────────────────────────────────────────────────

export const PROCESSING = {
  maxDuration: 30,
  withoutEnlargement: true,
} as const

// ── Upload Constraints ───────────────────────────────────────────

export const UPLOAD = {
  maxFileSize: 10 * 1024 * 1024,
  minShortSide: 1000,
  acceptedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/heic',
    'image/heif',
  ] as const,
  maxPhotosPerProfile: 6,
} as const

// ── Storage ──────────────────────────────────────────────────────

export const STORAGE = {
  bucket: 'profile-photos',
  pathPattern: '{userId}/{photoId}-{suffix}.{format}',
  originalPathPattern: '{userId}/{photoId}.original',
} as const

// ── Variant Definitions ──────────────────────────────────────────

export interface VariantConfig {
  name: string
  width: number
  height: number
  aspectRatio: { w: number; h: number }
  fit: 'cover' | 'inside'
  blur: number | null
  cacheControl: string
  generateBlurred: boolean
  fileSuffix: string
  jsonbKey: string
  publicName: 'avatar' | 'cover' | 'full' | null
}

export const PHOTO_VARIANTS: Record<string, VariantConfig> = {
  avatar: {
    name: 'Avatar',
    width: 100,
    height: 100,
    aspectRatio: { w: 1, h: 1 },
    fit: 'cover',
    blur: null,
    cacheControl: 'private, max-age=3600, immutable',
    generateBlurred: false,
    fileSuffix: 'avatar',
    jsonbKey: 'avatar',
    publicName: 'avatar',
  },

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

  cover_blurred: {
    name: 'Cover Blurred',
    width: 400,
    height: 500,
    aspectRatio: { w: 4, h: 5 },
    fit: 'cover',
    blur: 40,
    cacheControl: 'private, no-store',
    generateBlurred: false,
    fileSuffix: 'cover-blurred',
    jsonbKey: 'cover_blurred',
    publicName: null,
  },

  full: {
    name: 'Full',
    width: 1200,
    height: 1500,
    aspectRatio: { w: 4, h: 5 },
    fit: 'inside',
    blur: null,
    cacheControl: 'private, no-store',
    generateBlurred: true,
    fileSuffix: 'full',
    jsonbKey: 'full',
    publicName: 'full',
  },

  full_blurred: {
    name: 'Full Blurred',
    width: 1200,
    height: 1500,
    aspectRatio: { w: 4, h: 5 },
    fit: 'inside',
    blur: 60,
    cacheControl: 'private, no-store',
    generateBlurred: false,
    fileSuffix: 'full-blurred',
    jsonbKey: 'full_blurred',
    publicName: null,
  },
} as const

// ── Derived Types ─────────────────────────────────────────────────

export type VariantKey = keyof typeof PHOTO_VARIANTS
export type PublicVariant = NonNullable<VariantConfig['publicName']>

export const PUBLIC_VARIANTS = Object.values(PHOTO_VARIANTS)
  .filter((v) => v.publicName !== null)
  .map((v) => v.publicName!) as PublicVariant[]

// ── Lookup Helpers ────────────────────────────────────────────────

export function getVariantByPublicName(name: PublicVariant): VariantConfig {
  const variant = Object.values(PHOTO_VARIANTS).find((v) => v.publicName === name)
  if (!variant) throw new Error(`Unknown public variant: ${name}`)
  return variant
}

export function getBlurredVariant(publicName: PublicVariant): VariantConfig | null {
  if (publicName === 'avatar') return null
  const key = `${publicName}_blurred` as VariantKey
  return PHOTO_VARIANTS[key] ?? null
}

export function resolveServeVariant(
  publicVariant: PublicVariant,
  showFull: boolean,
): VariantConfig {
  if (publicVariant === 'avatar' || showFull) {
    return getVariantByPublicName(publicVariant)
  }
  return getBlurredVariant(publicVariant)!
}

export function buildStoragePath(
  userId: string,
  photoId: string,
  variant: VariantConfig,
  format: ImageFormat,
): string {
  return `${userId}/${photoId}-${variant.fileSuffix}.${format}`
}

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
