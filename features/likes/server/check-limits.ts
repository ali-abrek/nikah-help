import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { AppError } from '@/lib/errors/app-error'

export async function checkLikeLimits(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data: hasSub } = await supabase.rpc('has_active_subscription', { p_user: userId } as never)

  if (hasSub) return // Premium → unlimited

  // Check gender
  const { data: profile } = await supabase
    .from('profiles')
    .select('gender')
    .eq('id', userId)
    .single()

  if (!profile) throw new AppError('AUTH_UNAUTHORIZED')

  // Female users unlimited
  if (profile.gender === 'female') return

  // Free-tier male: check lifetime likes count
  const { data: count } = await supabase
    .rpc('count_likes_used', { p_user: userId } as never)

  if (typeof count === 'number' && count >= 3) {
    throw new AppError('LIKE_LIMIT_REACHED', {
      message: 'Бесплатный лимит исчерпан. Оформите подписку, чтобы отправлять больше лайков.',
    })
  }
}
