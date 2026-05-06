import { createServerSupabase } from '@/lib/supabase/server'
import { AppError } from '@/lib/errors/app-error'

export async function reorderPhotos(
  userId: string,
  orderedPhotoIds: string[],
): Promise<void> {
  const supabase = await createServerSupabase()

  type RpcResult = { error: Error | null }
  const rpc = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<RpcResult>)('reorder_profile_photos', {
    p_profile_id: userId,
    p_photo_ids: orderedPhotoIds,
  })

  const error = rpc.error

  if (error) {
    if (error.message.includes('does not belong')) {
      throw new AppError('PHOTO_NOT_OWNER', { cause: error })
    }
    if (error.message.includes('count mismatch')) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        message: error.message,
        logContext: { submitted: orderedPhotoIds.length },
      })
    }
    throw new AppError('SYSTEM_DATABASE_ERROR', { cause: error })
  }
}
