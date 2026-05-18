import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createServerSupabase } from '@/lib/supabase/server'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { PHOTO_UPLOAD } from '@/lib/ratelimit/presets'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'
import {
  STORAGE,
  UPLOAD,
  PHOTO_VARIANTS,
  FORMATS,
  buildStoragePath,
} from '@/lib/image-processing/photo-variants'
import { callReorderProfilePhotos } from '@/lib/supabase/rpc'
import { captureSentryException } from '@/lib/sentry/capture'

export const runtime = 'nodejs'

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

      // Free up slots held by rejected photos: they're hidden from the user but
      // still occupy positions in the DB, which causes PHOTO_POSITION_TAKEN
      // when the wizard counts visible photos and requests the next position.
      const { data: rejected } = await supabase
        .from('photos')
        .select('id, storage_path')
        .eq('profile_id', userId)
        .eq('moderation_status', 'rejected')

      if (rejected && rejected.length > 0) {
        const rejectedIds = rejected.map((r) => r.id)
        const { error: delErr } = await supabase.from('photos').delete().in('id', rejectedIds)
        if (delErr) {
          void captureSentryException(delErr, {
            flow: 'image.upload',
            severity: 'warning',
            tags: { step: 'rejected_cleanup_db' },
            extra: { logContext: { userId, count: rejected.length } },
          })
        } else {
          const paths: string[] = []
          for (const r of rejected) {
            if (r.storage_path) paths.push(r.storage_path)
            for (const variant of Object.values(PHOTO_VARIANTS)) {
              for (const format of FORMATS) {
                paths.push(buildStoragePath(userId, r.id, variant, format))
              }
            }
          }
          if (paths.length > 0) {
            const { error: removeErr } = await supabase.storage.from(STORAGE.bucket).remove(paths)
            if (removeErr) {
              void captureSentryException(removeErr, {
                flow: 'image.upload',
                severity: 'warning',
                tags: { step: 'rejected_cleanup_storage' },
                extra: { logContext: { userId, pathsCount: paths.length } },
              })
            }
          }
        }

        // Compact positions to 1..N so the wizard's UI position matches DB.
        const { data: remaining } = await supabase
          .from('photos')
          .select('id')
          .eq('profile_id', userId)
          .order('position', { ascending: true })

        if (remaining && remaining.length > 0) {
          const { error: reorderErr } = await callReorderProfilePhotos(supabase, {
            p_profile_id: userId,
            p_photo_ids: remaining.map((r) => r.id),
            p_expected_signature: null,
          })
          if (reorderErr) {
            void captureSentryException(new Error(reorderErr.message), {
              flow: 'image.upload',
              severity: 'warning',
              tags: { step: 'rejected_cleanup_reorder' },
              extra: { logContext: { userId } },
            })
          }
        }
      }

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

      // PostgreSQL forbids ON CONFLICT with DEFERRABLE constraints (the
      // (profile_id, position) unique constraint is deferred for reorder).
      // Replace the old upsert with an explicit delete-then-insert: if a
      // pending row exists at this slot (checked above), remove it first so
      // the new row gets a fresh id and storage path. Ownership is already
      // verified by withAuth + the eq('profile_id', userId) filter.
      if (existing) {
        const { error: delErr } = await supabase
          .from('photos')
          .delete()
          .eq('id', existing.id)
          .eq('profile_id', userId)

        if (delErr) {
          throw new AppError('SYSTEM_DATABASE_ERROR', {
            cause: delErr,
            logContext: { userId, position, existingId: existing.id },
          })
        }
      }

      const { error: insertErr } = await supabase.from('photos').insert({
        id: photoId,
        profile_id: userId,
        storage_path: path,
        position,
        status: 'pending',
      })

      if (insertErr) {
        throw new AppError('SYSTEM_DATABASE_ERROR', {
          cause: insertErr,
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
