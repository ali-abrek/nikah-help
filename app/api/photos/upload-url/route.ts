import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createServerSupabase } from '@/lib/supabase/server'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { PHOTO_UPLOAD } from '@/lib/ratelimit/presets'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'
import { STORAGE, UPLOAD } from '@/lib/image-processing/photo-variants'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heic',
}

export const POST = withAuth(
  withRateLimit(async (request: NextRequest) => {
    try {
      // Trusted: withAuth has already verified the JWT and overwritten this
      // header with the verified subject id.
      const userId = request.headers.get('x-user-id')
      if (!userId) throw new AppError('AUTH_UNAUTHORIZED')

      const body = (await request.json().catch(() => ({}))) as {
        mimeType?: string
        filename?: string
        position?: number
      }

      const mimeType =
        body.mimeType ??
        (body.filename
          ? Object.entries(MIME_TO_EXT).find(([, ext]) =>
              body.filename!.toLowerCase().endsWith('.' + ext),
            )?.[0]
          : undefined)

      if (
        !mimeType ||
        !UPLOAD.acceptedMimeTypes.includes(mimeType as (typeof UPLOAD.acceptedMimeTypes)[number])
      ) {
        throw new AppError('VALIDATION_FILE_UNSUPPORTED_FORMAT', {
          message: `Unsupported file type: ${mimeType ?? 'unknown'}`,
        })
      }

      const position = body.position
      if (typeof position !== 'number' || position < 1 || position > UPLOAD.maxPhotosPerProfile) {
        throw new AppError('VALIDATION_INVALID_INPUT', {
          message: `position must be between 1 and ${UPLOAD.maxPhotosPerProfile}`,
        })
      }

      const supabase = await createServerSupabase()

      // RLS scopes this lookup to the authenticated user — defence-in-depth on
      // top of the explicit `profile_id = userId` filter.
      const { data: existing } = await supabase
        .from('photos')
        .select('id, status')
        .eq('profile_id', userId)
        .eq('position', position)
        .maybeSingle()

      if (existing && existing.status !== 'pending') {
        throw new AppError('PHOTO_POSITION_TAKEN')
      }

      const photoId = randomUUID()
      // Belt-and-braces: userId comes from a verified JWT subject and photoId
      // is randomUUID(), but reject anything that could break out of the
      // storage prefix if either source ever changes.
      if (!UUID_RE.test(userId) || !UUID_RE.test(photoId)) {
        throw new AppError('VALIDATION_INVALID_INPUT', {
          message: 'Invalid identifier format',
        })
      }
      const path = STORAGE.originalPathPattern
        .replace('{userId}', userId)
        .replace('{photoId}', photoId)

      // Upsert pending row under the user's session — RLS enforces ownership.
      // Conflicting pending rows from earlier abandoned attempts get replaced;
      // `photo/abandon-cleanup` will GC their orphaned originals.
      const { error: upsertErr } = await supabase.from('photos').upsert(
        {
          id: photoId,
          profile_id: userId,
          storage_path: path,
          position,
          status: 'pending',
        },
        { onConflict: 'profile_id, position' },
      )

      if (upsertErr) {
        throw new AppError('SYSTEM_DATABASE_ERROR', {
          cause: upsertErr,
          logContext: { userId, position, photoId },
        })
      }

      const { data, error: signErr } = await supabase.storage
        .from(STORAGE.bucket)
        .createSignedUploadUrl(path, { upsert: true })

      if (signErr || !data) {
        // Roll back the row so the slot doesn't stay locked forever.
        await supabase.from('photos').delete().eq('id', photoId)
        throw new AppError('PHOTO_UPLOAD_FAILED', {
          cause: signErr ?? undefined,
          logContext: { userId, photoId },
        })
      }

      return NextResponse.json({
        photoId,
        signedUrl: data.signedUrl,
        path,
        token: data.token,
      })
    } catch (error) {
      return handleRouteError(error)
    }
  }, PHOTO_UPLOAD),
)
