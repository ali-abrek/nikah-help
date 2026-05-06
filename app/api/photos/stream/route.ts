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
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { READ_GENEROUS } from '@/lib/ratelimit/presets'

export const runtime = 'nodejs'

interface StreamContextRow {
  id: string
  profile_id: string
  moderation_status: string
  variants: Record<string, { avif?: string; webp?: string }> | null
  is_published: boolean
  private_mode: boolean
  show_full: boolean
  can_view: boolean
}

export const GET = withRateLimit(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const photoId = searchParams.get('photoId')
    const variantParam = searchParams.get('variant') as PublicVariant | null
    const fmt = searchParams.get('fmt') as ImageFormat | null
    const viewerId = request.headers.get('x-user-id')

    if (!viewerId) throw new AppError('AUTH_UNAUTHORIZED')

    if (!photoId) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        details: { photoId: 'Required' },
      })
    }
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

    const supabase = createAdminClient()

    // Custom RPC not in generated types — use type assertion
    type RpcResult = { data: StreamContextRow | null; error: Error | null }
    const rpc = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<RpcResult>)('get_photo_stream_context', {
      p_photo_id: photoId,
      p_viewer_id: viewerId,
    })

    const ctx = rpc.data
    if (rpc.error || !ctx || !ctx.can_view) {
      throw new AppError('NOT_FOUND', {
        cause: rpc.error ?? undefined,
        logContext: { photoId, viewerId },
      })
    }

    const showFull = Boolean(ctx.show_full)
    const variant = resolveServeVariant(variantParam, showFull)

    const variants = ctx.variants
    const path = variants?.[variant.jsonbKey]?.[fmt] as string | undefined
    if (!path) {
      throw new AppError('NOT_FOUND', {
        logContext: { photoId, variant: variant.jsonbKey, format: fmt },
      })
    }

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
}, READ_GENEROUS)
