import { inngest, photoReplaceCleanupEvent } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { PHOTO_VARIANTS, STORAGE, FORMATS } from '@/lib/image-processing/photo-variants'
import { captureSentryException } from '@/lib/sentry/capture'

export const photoReplaceCleanupFn = inngest.createFunction(
  {
    id: 'photo.replace-cleanup',
    retries: 3,
    triggers: [photoReplaceCleanupEvent],
    onFailure: async ({ event, error }) => {
      const { oldPhotoId } = event.data as { oldPhotoId?: string }
      await captureSentryException(error, {
        flow: 'moderation.cleanup',
        severity: 'error',
        tags: { step: 'retry_exhausted' },
        extra: { photoId: oldPhotoId ?? 'unknown' },
      })
    },
  },
  async ({ event, step }) => {
    const { oldPhotoId, userId } = event.data

    // Delete old photo's variant files from storage
    await step.run('delete-old-variants', async () => {
      const supabase = createAdminClient()

      for (const variant of Object.values(PHOTO_VARIANTS)) {
        for (const format of FORMATS) {
          const path = `${userId}/${oldPhotoId}-${variant.fileSuffix}.${format}`
          await supabase.storage.from(STORAGE.bucket).remove([path])
        }
      }
    })

    // Delete old photo row
    await step.run('delete-old-row', async () => {
      const supabase = createAdminClient()
      await supabase.from('photos').delete().eq('id', oldPhotoId)
    })

    return { success: true, oldPhotoId }
  },
)
