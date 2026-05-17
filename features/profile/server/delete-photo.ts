import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { AppError } from '@/lib/errors/app-error'
import {
  PHOTO_VARIANTS,
  STORAGE,
  FORMATS,
  buildStoragePath,
} from '@/lib/image-processing/photo-variants'
import { callReorderProfilePhotos } from '@/lib/supabase/rpc'
import { captureSentryException } from '@/lib/sentry/capture'

export async function deletePhoto(
  supabase: SupabaseClient<Database>,
  userId: string,
  photoId: string,
): Promise<void> {
  // 1. Fetch photo to verify ownership and capture file metadata for cleanup
  const { data: photo, error: findError } = await supabase
    .from('photos')
    .select('id, position, profile_id, moderation_status, storage_path')
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

  // 2. Block deleting the last approved photo — the user must always retain
  //    at least one approved photo. Rejected/queued/manual_review photos do
  //    not count as a fallback because they cannot be displayed publicly.
  if (photo.moderation_status === 'approved') {
    const { count: approvedCount } = await supabase
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', userId)
      .eq('moderation_status', 'approved')

    if ((approvedCount ?? 0) <= 1) {
      throw new AppError('PHOTO_ONLY_APPROVED_DELETED', {
        message: 'Cannot delete the last approved photo',
        logContext: { photoId, userId, approvedCount: approvedCount ?? 0 },
      })
    }
  }

  // 3. Delete the photo row first to release the UNIQUE(profile_id, position)
  //    constraint, so the subsequent reorder can renumber the remaining rows.
  const { error: deleteError } = await supabase.from('photos').delete().eq('id', photoId)
  if (deleteError) throw deleteError

  // 4. Delete files from Storage — original (if processing hadn't dropped it)
  //    and every variant file. Best-effort: a Storage failure here leaves
  //    orphaned bytes but the DB is authoritative for what the user sees, so
  //    we log and continue rather than failing the user-facing delete.
  try {
    const paths: string[] = []
    if (photo.storage_path) paths.push(photo.storage_path)
    for (const variant of Object.values(PHOTO_VARIANTS)) {
      for (const format of FORMATS) {
        paths.push(buildStoragePath(userId, photoId, variant, format))
      }
    }
    if (paths.length > 0) {
      const { error: removeErr } = await supabase.storage.from(STORAGE.bucket).remove(paths)
      if (removeErr) {
        void captureSentryException(removeErr, {
          flow: 'action.delete_photo',
          severity: 'warning',
          tags: { step: 'storage_remove' },
          extra: { photoId, logContext: { userId, pathsCount: paths.length } },
        })
      }
    }
  } catch (e) {
    void captureSentryException(e, {
      flow: 'action.delete_photo',
      severity: 'warning',
      tags: { step: 'storage_remove_exception' },
      extra: { photoId, logContext: { userId } },
    })
  }

  // 5. Renumber remaining photos so positions stay sequential 1..N — no gaps.
  const { data: remaining } = await supabase
    .from('photos')
    .select('id')
    .eq('profile_id', userId)
    .order('position', { ascending: true })

  if (remaining && remaining.length > 0) {
    const { error: reorderErr } = await callReorderProfilePhotos(supabase, {
      p_profile_id: userId,
      p_photo_ids: remaining.map((r) => r.id),
      p_expected_signature: null,
    })
    if (reorderErr) {
      void captureSentryException(new Error(reorderErr.message), {
        flow: 'action.delete_photo',
        severity: 'warning',
        tags: { step: 'reorder_after_delete' },
        extra: { photoId, logContext: { userId } },
      })
    }
  }
}
