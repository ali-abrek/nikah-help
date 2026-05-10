import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { processImage } from '@/lib/image-processing/pipeline'
import { STORAGE } from '@/lib/image-processing/photo-variants'
import { validateUpload } from '@/lib/image-processing/validate-upload'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { PHOTO_UPLOAD } from '@/lib/ratelimit/presets'

export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({
  photoId: z.uuid(),
})

export const POST = withAuth(
  withRateLimit(async (request: NextRequest) => {
    try {
      // Trusted: withAuth has verified the JWT and set this header.
      const userId = request.headers.get('x-user-id')
      if (!userId) throw new AppError('AUTH_UNAUTHORIZED')

      const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
      if (!parsed.success) {
        throw new AppError('VALIDATION_INVALID_INPUT', {
          details: { photoId: 'Required (uuid)' },
        })
      }
      const { photoId } = parsed.data

      const supabase = createAdminClient()

      const { data: photo, error: fetchError } = await supabase
        .from('photos')
        .select('id, profile_id, storage_path, status, variants')
        .eq('id', photoId)
        .single()

      if (fetchError || !photo) {
        throw new AppError('NOT_FOUND', {
          cause: fetchError ?? undefined,
          logContext: { photoId },
        })
      }

      if (photo.profile_id !== userId) {
        throw new AppError('PHOTO_NOT_OWNER', { logContext: { photoId, userId } })
      }

      // Idempotency: a successful prior run already populated variants and
      // dropped the original. Replay the same response so callers (Inngest
      // retries, network glitches, manual reposts) can't corrupt state.
      if (photo.status === 'processed') {
        return NextResponse.json({ success: true, photoId, alreadyProcessed: true })
      }

      if (!photo.storage_path) {
        throw new AppError('VALIDATION_INVALID_INPUT', {
          message: 'Photo has no original file path',
          logContext: { photoId },
        })
      }

      // Atomic claim: only one runner may move {pending,uploaded} → processing.
      // Concurrent runners see 0 affected rows and bail out without re-uploading.
      const { data: claimed, error: claimErr } = await supabase
        .from('photos')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', photoId)
        .in('status', ['pending', 'uploaded'])
        .select('id')
        .maybeSingle()

      if (claimErr) {
        throw new AppError('SYSTEM_DATABASE_ERROR', {
          cause: claimErr,
          logContext: { photoId },
        })
      }
      if (!claimed) {
        // Another runner already owns this photo. Treat as success-in-progress
        // rather than failing the caller.
        return NextResponse.json({ success: true, photoId, inProgress: true })
      }

      // Step: download original
      const { data: file, error: downloadError } = await supabase.storage
        .from(STORAGE.bucket)
        .download(photo.storage_path)

      if (downloadError || !file) {
        throw new AppError('PHOTO_DOWNLOAD_FAILED', {
          cause: downloadError ?? undefined,
          logContext: { photoId, userId, path: photo.storage_path },
        })
      }

      const buffer = Buffer.from(await file.arrayBuffer())

      // Step: validate
      await validateUpload(buffer)

      // Step: generate variants (pure, retryable)
      const result = await processImage(buffer, userId, photoId)

      // Step: upload variants — pass each variant's intended Cache-Control so
      // any direct Storage delivery (signed URLs etc.) honours it. Stream
      // handler still sets its own headers when proxying.
      for (const f of result.files) {
        const { error: uploadError } = await supabase.storage
          .from(STORAGE.bucket)
          .upload(f.path, f.buffer, {
            contentType: f.contentType,
            cacheControl: f.cacheControl,
            upsert: true,
          })

        if (uploadError) {
          throw new AppError('PHOTO_UPLOAD_FAILED', {
            cause: uploadError,
            logContext: { photoId, path: f.path },
          })
        }
      }

      // Step: delete original (separate from upload step so an interrupted
      // run that already uploaded variants still converges on the next call —
      // status stays at 'processing' and the next attempt re-claims it.)
      await supabase.storage.from(STORAGE.bucket).remove([photo.storage_path])

      // Step: finalize photos row
      const { error: finalErr } = await supabase
        .from('photos')
        .update({
          status: 'processed',
          variants: result.variantsJsonb,
          storage_path: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', photoId)

      if (finalErr) {
        throw new AppError('SYSTEM_DATABASE_ERROR', {
          cause: finalErr,
          logContext: { photoId },
        })
      }

      return NextResponse.json({ success: true, photoId })
    } catch (error) {
      return handleRouteError(error)
    }
  }, PHOTO_UPLOAD),
)
