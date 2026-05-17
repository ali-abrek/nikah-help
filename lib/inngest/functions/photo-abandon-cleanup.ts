import { inngest, photoAbandonCleanupEvent } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { STORAGE } from '@/lib/image-processing/photo-variants'
import { captureSentryException } from '@/lib/sentry/capture'

export const photoAbandonCleanupFn = inngest.createFunction(
  {
    id: 'photo.abandon-cleanup',
    retries: 3,
    triggers: [photoAbandonCleanupEvent],
    onFailure: async ({ event, error }) => {
      const { photoId } = event.data as { photoId?: string }
      await captureSentryException(error, {
        flow: 'moderation.cleanup',
        severity: 'error',
        tags: { step: 'retry_exhausted' },
        extra: { photoId: photoId ?? 'unknown' },
      })
    },
  },
  async ({ event, step }) => {
    const { photoId, storagePath } = event.data

    // Delete original file from storage
    await step.run('delete-original', async () => {
      const supabase = createAdminClient()
      await supabase.storage.from(STORAGE.bucket).remove([storagePath])
    })

    // Delete photo row
    await step.run('delete-row', async () => {
      const supabase = createAdminClient()
      await supabase.from('photos').delete().eq('id', photoId)
    })

    return { success: true, photoId }
  },
)
