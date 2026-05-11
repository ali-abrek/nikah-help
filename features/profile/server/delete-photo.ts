import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { AppError } from '@/lib/errors/app-error'

export async function deletePhoto(
  supabase: SupabaseClient<Database>,
  userId: string,
  photoId: string,
): Promise<void> {
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

  // 2. If deleting position 1 (avatar), find the next approved photo to promote.
  //    We must resolve the candidate BEFORE deleting, but actually delete FIRST
  //    to avoid a UNIQUE(profile_id, position) violation when we then set the
  //    candidate's position to 1.
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

    if (!nextApproved) {
      // No other approved photo — block deletion if profile is published.
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

    // Delete the photo row first so the unique position constraint is released,
    // then promote the next approved photo to position 1.
    const { error: deleteError } = await supabase.from('photos').delete().eq('id', photoId)
    if (deleteError) throw deleteError

    if (nextApproved) {
      await supabase
        .from('photos')
        .update({ position: 1, updated_at: new Date().toISOString() })
        .eq('id', nextApproved.id)
    }

    return
  }

  // 3. Delete the photo row (non-position-1 case)
  const { error: deleteError } = await supabase.from('photos').delete().eq('id', photoId)

  if (deleteError) throw deleteError
}
