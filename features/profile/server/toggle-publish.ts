import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export interface TogglePublishResult {
  success: boolean
  is_published: boolean
  error?: string
}

/**
 * Toggles the profile publish state.
 * On publish: checks that the profile has at least one approved photo.
 * On unpublish: always allowed (warn about feed visibility at the UI level).
 */
export async function togglePublish(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<TogglePublishResult> {
  // Get current state
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('is_published')
    .eq('id', userId)
    .single()

  if (profileErr || !profile) {
    return { success: false, is_published: false, error: 'Профиль не найден' }
  }

  const willBePublished = !profile.is_published

  if (willBePublished) {
    // Must have at least one approved photo to publish
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
        error: 'Для публикации необходимо хотя бы одно одобренное фото',
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
