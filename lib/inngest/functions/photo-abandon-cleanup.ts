import { inngest } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { STORAGE } from '@/lib/image-processing/photo-variants'

export const photoAbandonCleanupFn = inngest.createFunction(
  {
    id: 'photo.abandon-cleanup',
    retries: 3,
    triggers: { event: 'photo/abandon-cleanup' },
  },
  async ({ event, step }) => {
    const { photoId, storagePath } = event.data as {
      photoId: string
      storagePath: string
    }

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
