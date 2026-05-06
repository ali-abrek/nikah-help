import { inngest } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { PHOTO_VARIANTS, STORAGE, FORMATS } from '@/lib/image-processing/photo-variants'

export const photoReplaceCleanupFn = inngest.createFunction(
  {
    id: 'photo.replace-cleanup',
    retries: 3,
    triggers: { event: 'photo/replace-cleanup' },
  },
  async ({ event, step }) => {
    const { oldPhotoId, userId } = event.data as { oldPhotoId: string; userId: string }

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
