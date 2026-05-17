import { inngest, photoProcessEvent, photoModerateEvent } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { processImage } from '@/lib/image-processing/pipeline'
import { STORAGE } from '@/lib/image-processing/photo-variants'
import { validateUpload } from '@/lib/image-processing/validate-upload'
import { moderatePhoto } from '@/lib/image-processing/moderate-photo'
import { captureSentryException } from '@/lib/sentry/capture'
import { NonRetriableError } from 'inngest'

export const photoProcessFn = inngest.createFunction(
  {
    id: 'photo.process',
    retries: 3,
    triggers: [photoProcessEvent],
    onFailure: async ({ event, error }) => {
      const { photoId } = event.data as { photoId?: string }
      await captureSentryException(error, {
        flow: 'image.process',
        severity: 'error',
        tags: { step: 'retry_exhausted' },
        extra: { photoId: photoId ?? 'unknown' },
      })
    },
  },
  async ({ event, step }) => {
    const { photoId } = event.data

    // Step 1: fetch metadata + download original + validate.
    // Combined into one step so the Buffer stays local and avoids
    // Inngest's JSON serialization which would corrupt binary data.
    const ctx = await step.run('fetch-and-download', async () => {
      const supabase = createAdminClient()

      const { data: photo, error: fetchError } = await supabase
        .from('photos')
        .select('id, profile_id, storage_path, status')
        .eq('id', photoId)
        .single()

      if (fetchError || !photo) {
        throw new NonRetriableError(`Photo not found: ${photoId}`)
      }
      if (!photo.storage_path) {
        throw new NonRetriableError(`Photo has no original file: ${photoId}`)
      }

      const { data: file, error: downloadError } = await supabase.storage
        .from(STORAGE.bucket)
        .download(photo.storage_path)

      if (downloadError || !file) {
        throw new Error(`Failed to download original: ${downloadError?.message ?? 'unknown'}`)
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      await validateUpload(buffer)

      return {
        profileId: photo.profile_id,
        storagePath: photo.storage_path,
        bufferBase64: buffer.toString('base64'),
      }
    })

    // Step 2: generate variants + upload + finalize + moderate.
    // Kept as one step so variant Buffers don't cross the boundary.
    await step.run('process-and-finalize', async () => {
      const supabase = createAdminClient()
      const buffer = Buffer.from(ctx.bufferBase64, 'base64')

      const result = await processImage(buffer, ctx.profileId, photoId)

      await Promise.all(
        result.files.map((f) =>
          supabase.storage.from(STORAGE.bucket).upload(f.path, f.buffer, {
            contentType: f.contentType,
            cacheControl: f.cacheControl,
            upsert: true,
          }),
        ),
      )

      await supabase.storage.from(STORAGE.bucket).remove([ctx.storagePath])

      const { error: finalErr } = await supabase
        .from('photos')
        .update({
          status: 'processed',
          variants: result.variantsJsonb,
          storage_path: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', photoId)

      if (finalErr) throw finalErr

      try {
        await moderatePhoto(photoId)
      } catch (err) {
        void captureSentryException(err, {
          flow: 'moderation.sync',
          severity: 'warning',
          tags: { step: 'sync_fallback_to_inngest' },
          extra: { photoId },
        })
        await inngest.send(photoModerateEvent.create({ photoId }))
      }
    })

    return { photoId, status: 'processed' }
  },
)
