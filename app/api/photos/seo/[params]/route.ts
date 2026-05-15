import { NextRequest, NextResponse } from 'next/server'
import { STORAGE, FORMATS } from '@/lib/image-processing/photo-variants'
import type { PublicVariant, ImageFormat } from '@/lib/image-processing/photo-variants'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const VALID_VARIANTS: PublicVariant[] = ['avatar', 'cover', 'full']

function parseSeoParams(
  raw: string,
): { photoId: string; variant: PublicVariant; fmt: ImageFormat } | null {
  const uuid = raw.slice(0, 36)
  if (!UUID_RE.test(uuid)) return null

  const dot = raw.lastIndexOf('.')
  if (dot === -1) return null
  const fmt = raw.slice(dot + 1)
  if (!FORMATS.includes(fmt as ImageFormat)) return null

  const afterUuid = raw.slice(36, dot)
  for (const v of VALID_VARIANTS) {
    if (afterUuid.endsWith(`-${v}`)) {
      return { photoId: uuid, variant: v, fmt: fmt as ImageFormat }
    }
  }
  return null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ params: string }> },
) {
  try {
    const { params: raw } = await params
    const parsed = parseSeoParams(raw)
    if (!parsed) throw new AppError('NOT_FOUND')

    const supabase = createAdminClient()

    const { data: photo, error: photoError } = await supabase
      .from('photos')
      .select('id, profile_id, variants, moderation_status')
      .eq('id', parsed.photoId)
      .eq('moderation_status', 'approved')
      .single()

    if (photoError || !photo) throw new AppError('NOT_FOUND')

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_published, deletion_status')
      .eq('id', photo.profile_id)
      .single()

    if (!profile || !profile.is_published || profile.deletion_status) {
      throw new AppError('NOT_FOUND')
    }

    const variants =
      (photo.variants as Record<string, { avif: string; webp: string }> | null) ?? {}
    const path = variants[parsed.variant]?.[parsed.fmt]
    if (!path) throw new AppError('NOT_FOUND')

    const { data: file, error: downloadError } = await supabase.storage
      .from(STORAGE.bucket)
      .download(path)

    if (downloadError || !file) {
      throw new AppError('PHOTO_DOWNLOAD_FAILED', {
        cause: downloadError ?? undefined,
      })
    }

    return new NextResponse(file, {
      headers: {
        'Content-Type': `image/${parsed.fmt}`,
        'Cache-Control': 'public, max-age=86400, immutable',
        'Content-Disposition': 'inline; filename="photo"',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
