import { NextRequest, NextResponse } from 'next/server'
import {
  STORAGE,
  FORMATS,
  resolveServeVariant,
  type PublicVariant,
  type ImageFormat,
} from '@/lib/image-processing/photo-variants'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'
import { callPhotoStreamContext } from '@/lib/supabase/rpc'

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

    const { data, error: rpcError } = await callPhotoStreamContext(supabase, {
      p_photo_id: parsed.photoId,
      p_viewer_id: null as unknown as string,
    })

    const ctx = Array.isArray(data) ? data[0] : null
    if (rpcError || !ctx || !ctx.can_view) {
      throw new AppError('NOT_FOUND', {
        cause: rpcError ? new Error(rpcError.message) : undefined,
        logContext: { photoId: parsed.photoId, seo: true },
      })
    }

    const showFull = Boolean(ctx.show_full)
    const variant = resolveServeVariant(parsed.variant, showFull)

    const variants = ctx.variants
    const path = variants?.[variant.jsonbKey]?.[parsed.fmt] as string | undefined
    if (!path) {
      throw new AppError('NOT_FOUND', {
        logContext: { photoId: parsed.photoId, variant: variant.jsonbKey, format: parsed.fmt },
      })
    }

    const { data: file, error } = await supabase.storage.from(STORAGE.bucket).download(path)

    if (error || !file) {
      throw new AppError('PHOTO_DOWNLOAD_FAILED', {
        cause: error ?? undefined,
        logContext: { photoId: parsed.photoId, path },
      })
    }

    return new NextResponse(file, {
      headers: {
        'Content-Type': `image/${parsed.fmt}`,
        'Cache-Control': variant.cacheControl,
        'Content-Disposition': 'inline; filename="photo"',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
