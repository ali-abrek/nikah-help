import { inngest } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { PHOTO_VARIANTS, STORAGE, FORMATS } from '@/lib/image-processing/photo-variants'
import { NonRetriableError } from 'inngest'

async function deleteVariantFiles(photoId: string, userId: string) {
  const supabase = createAdminClient()

  // Delete each variant file path
  for (const variant of Object.values(PHOTO_VARIANTS)) {
    for (const format of FORMATS) {
      const path = `${userId}/${photoId}-${variant.fileSuffix}.${format}`
      await supabase.storage.from(STORAGE.bucket).remove([path])
    }
  }
}

async function deletePhotoRow(photoId: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('photos').delete().eq('id', photoId)
  if (error) throw error
}

export const photoDeleteFn = inngest.createFunction(
  {
    id: 'photo.delete',
    retries: 3,
    triggers: { event: 'photo/delete' },
  },
  async ({ event, step }) => {
    const { photoId, userId } = event.data as { photoId: string; userId: string }

    const storagePath = await step.run('check-photo', async () => {
      const supabase = createAdminClient()
      const { data: photo } = await supabase
        .from('photos')
        .select('storage_path')
        .eq('id', photoId)
        .single()

      if (!photo) {
        throw new NonRetriableError(`Photo not found: ${photoId}`)
      }

      return photo.storage_path
    })

    // Delete original if still present (abandoned upload)
    if (storagePath) {
      await step.run('delete-original', async () => {
        const supabase = createAdminClient()
        await supabase.storage.from(STORAGE.bucket).remove([storagePath])
      })
    }

    // Delete all variant files
    await step.run('delete-variants', () => deleteVariantFiles(photoId, userId))

    // Delete photo row
    await step.run('delete-row', () => deletePhotoRow(photoId))

    return { success: true, photoId }
  },
)
