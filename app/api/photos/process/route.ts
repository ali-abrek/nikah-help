import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { PHOTO_UPLOAD } from '@/lib/ratelimit/presets'
import { inngest, photoProcessEvent } from '@/lib/inngest/client'

export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({
  photoId: z.uuid(),
})

export const POST = withAuth(
  withRateLimit(async (request: NextRequest) => {
    try {
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

      // Idempotency: a successful prior run already populated variants.
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
        return NextResponse.json({ success: true, photoId, inProgress: true })
      }

      await inngest.send(photoProcessEvent.create({ photoId }))

      return NextResponse.json({ success: true, photoId, accepted: true }, { status: 202 })
    } catch (error) {
      return handleRouteError(error)
    }
  }, PHOTO_UPLOAD),
)
