import { createAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'
import { inngest, likeRevokeEvent } from '@/lib/inngest/client'

interface RevokeLikeParams {
  fromUserId: string
  toUserId: string
}

export async function revokeLike({ fromUserId, toUserId }: RevokeLikeParams): Promise<void> {
  const supabase = createAdminClient()

  // 1. Find the like
  const { data: like } = await supabase
    .from('likes')
    .select('id')
    .eq('from_user_id', fromUserId)
    .eq('to_user_id', toUserId)
    .maybeSingle()

  if (!like) {
    throw new AppError('NOT_FOUND', { message: 'Лайк не найден' })
  }

  // 2. Check if match exists for this pair
  const { data: match } = await supabase
    .from('matches')
    .select('id')
    .or(`user_a.eq.${fromUserId},user_b.eq.${fromUserId}`)
    .or(`user_a.eq.${toUserId},user_b.eq.${toUserId}`)
    .maybeSingle()

  // 3. Soft-delete the like via revoked_at so count_likes_used includes it in
  //    the lifetime quota, preventing free-tier bypass through revoke-and-resend.
  const { error: revokeError } = await supabase
    .from('likes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', like.id)

  if (revokeError) {
    throw new AppError('SYSTEM_DATABASE_ERROR', {
      cause: revokeError,
      logContext: { likeId: like.id, fromUserId, toUserId },
    })
  }

  // 4. If match existed, trigger Inngest for cascading cleanup
  if (match) {
    await inngest.send(likeRevokeEvent.create({
      matchId: match.id,
      userId: fromUserId,
      otherUserId: toUserId,
    }))
  }
}
