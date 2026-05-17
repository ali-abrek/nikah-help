import { NextRequest, NextResponse } from 'next/server'
import {
  STORAGE,
  FORMATS,
  getVariantByPublicName,
  type PublicVariant,
  type ImageFormat,
} from '@/lib/image-processing/photo-variants'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { READ_GENEROUS } from '@/lib/ratelimit/presets'
import { requireStaff } from '@/features/moderation/server/require-staff'

export const runtime = 'nodejs'

// Moderator-only stream. Bypasses the standard photo_stream_context RPC
// (which gates on moderation_status='approved'), so moderators can preview
// photos sitting in manual_review. The endpoint refuses everyone but
// moderators and admins.
export const GET = withAuth(
  withRateLimit(async (request: NextRequest) => {
    try {
      const { searchParams } = new URL(request.url)
      const photoId = searchParams.get('photoId')
      const variantParam = searchParams.get('variant') as PublicVariant | null
      const fmt = searchParams.get('fmt') as ImageFormat | null
      const viewerId = request.headers.get('x-user-id')

      if (!viewerId) throw new AppError('AUTH_UNAUTHORIZED')
      await requireStaff(viewerId, 'moderator')

      if (!photoId) {
        throw new AppError('VALIDATION_INVALID_INPUT', { details: { photoId: 'Required' } })
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
      const { data: photo, error: fetchErr } = await supabase
        .from('photos')
        .select('variants')
        .eq('id', photoId)
        .maybeSingle()

      if (fetchErr || !photo) {
        throw new AppError('NOT_FOUND', { logContext: { photoId } })
      }

      const variant = getVariantByPublicName(variantParam)
      const variants = photo.variants as Record<string, Record<string, string>> | null
      const path = variants?.[variant.jsonbKey]?.[fmt]
      if (!path) {
        throw new AppError('NOT_FOUND', {
          logContext: { photoId, variant: variant.jsonbKey, format: fmt },
        })
      }

      const { data: file, error } = await supabase.storage.from(STORAGE.bucket).download(path)
      if (error || !file) {
        throw new AppError('PHOTO_DOWNLOAD_FAILED', {
          cause: error ?? undefined,
          logContext: { photoId, path },
        })
      }

      return new NextResponse(file, {
        headers: {
          'Content-Type': `image/${fmt}`,
          'Cache-Control': 'private, no-store',
          'Content-Disposition': 'inline; filename="photo"',
          'X-Content-Type-Options': 'nosniff',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      })
    } catch (error) {
      return handleRouteError(error)
    }
  }, READ_GENEROUS),
)
