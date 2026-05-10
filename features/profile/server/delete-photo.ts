import { createServerSupabase } from '@/lib/supabase/server'
import { AppError } from '@/lib/errors/app-error'

export async function deletePhoto(userId: string, photoId: string): Promise<void> {
  const supabase = await createServerSupabase()

  // 1. Fetch photo to verify ownership and get position
  const { data: photo, error: findError } = await supabase
    .from('photos')
    .select('id, position, profile_id, moderation_status')
    .eq('id', photoId)
    .single()

  if (findError || !photo) {
    throw new AppError('NOT_FOUND', {
      message: 'Photo not found',
      logContext: { photoId, userId },
    })
  }

  if (photo.profile_id !== userId) {
    throw new AppError('PHOTO_NOT_OWNER', {
      logContext: { photoId, userId, ownerId: photo.profile_id },
    })
  }

  // 2. If deleting position 1 (avatar), try to promote another approved photo
  if (photo.position === 1) {
    const { data: nextApproved } = await supabase
      .from('photos')
      .select('id, position')
      .eq('profile_id', userId)
      .eq('moderation_status', 'approved')
      .neq('id', photoId)
      .order('position', { ascending: true })
      .limit(1)
      .single()

    if (nextApproved) {
      // Promote to position 1
      await supabase
        .from('photos')
        .update({ position: 1, updated_at: new Date().toISOString() })
        .eq('id', nextApproved.id)
    } else {
      // Check if profile is published - if so, block deletion
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_published')
        .eq('id', userId)
        .single()

      if (profile?.is_published) {
        throw new AppError('PHOTO_ONLY_APPROVED_DELETED', {
          message: 'Cannot delete the only approved photo while profile is published',
          logContext: { photoId, userId },
        })
      }
    }
  }

  // 3. Delete the photo row
  const { error: deleteError } = await supabase.from('photos').delete().eq('id', photoId)

  if (deleteError) throw deleteError
}
