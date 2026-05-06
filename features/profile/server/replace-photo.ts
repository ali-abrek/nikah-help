import { createServerSupabase } from '@/lib/supabase/server'
import { AppError } from '@/lib/errors/app-error'

interface ReplacePhotoResult {
  newPhotoId: string
  oldPhotoId: string
  position: number
}

export async function replacePhoto(
  userId: string,
  position: number,
): Promise<ReplacePhotoResult> {
  const supabase = await createServerSupabase()

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
