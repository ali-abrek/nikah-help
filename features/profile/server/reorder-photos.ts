import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { AppError } from '@/lib/errors/app-error'
import { callReorderProfilePhotos } from '@/lib/supabase/rpc'

export async function reorderPhotos(
  supabase: SupabaseClient<Database>,
  userId: string,
  orderedPhotoIds: string[],
  expectedSignature?: string,
): Promise<void> {
  const { error } = await callReorderProfilePhotos(supabase, {
    p_profile_id: userId,
    p_photo_ids: orderedPhotoIds,
    p_expected_signature: expectedSignature ?? null,
  })

  if (error) {
    if (error.message.includes('PHOTO_REORDER_STALE')) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        message: 'Photo order changed elsewhere — refresh and try again',
        logContext: { reason: 'reorder_signature_mismatch' },
      })
    }
    if (error.message.includes('does not belong')) {
      throw new AppError('PHOTO_NOT_OWNER', { cause: new Error(error.message) })
    }
    if (error.message.includes('count mismatch')) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        message: error.message,
        logContext: { submitted: orderedPhotoIds.length },
      })
    }
    throw new AppError('SYSTEM_DATABASE_ERROR', {
      cause: new Error(error.message),
    })
  }
}

// Deterministic signature of the current `(position, id)` ordering for a
// profile, used as the expected snapshot when calling reorderPhotos. Keep
// this in sync with the SQL signature in 20260509093515_hardening.sql.
export function buildPhotoOrderSignature(
  rows: ReadonlyArray<{ id: string; position: number }>,
): string {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((r) => `${r.position}:${r.id}`)
    .join('|')
}
