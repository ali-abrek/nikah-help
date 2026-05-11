import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { AppError } from '@/lib/errors/app-error'

interface ReplacePhotoResult {
  newPhotoId: string
  oldPhotoId: string
  position: number
}

export async function replacePhoto(
  supabase: SupabaseClient<Database>,
  userId: string,
  position: number,
): Promise<ReplacePhotoResult> {
  // 1. Find old photo
  const { data: oldPhoto, error: findError } = await supabase
    .from('photos')
    .select('id')
    .eq('profile_id', userId)
    .eq('position', position)
    .single()

  if (findError || !oldPhoto) {
    throw new AppError('NOT_FOUND', {
      message: 'Photo not found at this position',
      logContext: { userId, position },
    })
  }

  // 2. Mark old photo for replacement (keep visible until new one is ready)
  await supabase
    .from('photos')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', oldPhoto.id)

  return {
    newPhotoId: '', // Client creates the row via upload-url flow
    oldPhotoId: oldPhoto.id,
    position,
  }
}
