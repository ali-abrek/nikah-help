import { createAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'
import { inngest } from '@/lib/inngest/client'

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

  // 3. Delete the like (this won't cascade to matches since it's not FK-linked)
  await supabase.from('likes').delete().eq('id', like.id)

  // 4. If match existed, trigger Inngest for cascading cleanup
  if (match) {
    await inngest.send({
      name: 'like/revoke',
      data: {
        matchId: match.id,
        userId: fromUserId,
        otherUserId: toUserId,
      },
    })
  }
}
