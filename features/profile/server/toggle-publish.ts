import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { ErrorCode } from '@/lib/errors/registry'

export interface TogglePublishResult {
  success: boolean
  is_published: boolean
  errorCode?: ErrorCode
  errorMessage?: string
}

/**
 * Toggles the profile publish state.
 * On publish: requires at least one approved photo.
 * On unpublish: always allowed.
 */
export async function togglePublish(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<TogglePublishResult> {
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('is_published')
    .eq('id', userId)
    .single()

  if (profileErr || !profile) {
    return {
      success: false,
      is_published: false,
      errorCode: 'NOT_FOUND',
      errorMessage: 'Профиль не найден',
    }
  }

  const willBePublished = !profile.is_published

  if (willBePublished) {
    const { count, error: countErr } = await supabase
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', userId)
      .eq('moderation_status', 'approved')

    if (countErr) throw countErr

    if (!count || count < 1) {
      return {
        success: false,
        is_published: false,
        errorCode: 'PROFILE_NO_APPROVED_PHOTO',
      }
    }
  }

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ is_published: willBePublished })
    .eq('id', userId)

  if (updateErr) throw updateErr

  return { success: true, is_published: willBePublished }
}
