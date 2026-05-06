import { createAdminClient } from '@/lib/supabase/admin'
import { checkLikeLimits } from './check-limits'
import { AppError } from '@/lib/errors/app-error'

interface SendLikeParams {
  fromUserId: string
  toUserId: string
}

interface SendLikeResult {
  matched: boolean
}

export async function sendLike({
  fromUserId,
  toUserId,
}: SendLikeParams): Promise<SendLikeResult> {
  const supabase = createAdminClient()

  // 1. Cannot like yourself
  if (fromUserId === toUserId) {
    throw new AppError('LIKE_OWN_PROFILE')
  }

  // 2. Check limits (gender + subscription)
  await checkLikeLimits(supabase, fromUserId)

  // 3. Fetch target profile for validation
  const { data: target } = await supabase
    .from('profiles')
    .select('gender, is_published, id')
    .eq('id', toUserId)
    .single()

  if (!target) {
    throw new AppError('NOT_FOUND', { message: 'Профиль не найден' })
  }

  if (!target.is_published) {
    throw new AppError('LIKE_TARGET_UNPUBLISHED')
  }

  // 4. Fetch sender gender
  const { data: sender } = await supabase
    .from('profiles')
    .select('gender')
    .eq('id', fromUserId)
    .single()

  if (!sender) {
    throw new AppError('AUTH_UNAUTHORIZED')
  }

  // 5. Opposite gender check
  if (sender.gender === target.gender) {
    throw new AppError('LIKE_GENDER_MISMATCH')
  }

  // 6. Block check
  const { data: blocked } = await supabase.rpc('is_blocked_pair', {
    a: fromUserId,
    b: toUserId,
  } as never)

  if (blocked) {
    throw new AppError('LIKE_BLOCKED')
  }

  // 7. Check if already liked (idempotency)
  const { data: existing } = await supabase
    .from('likes')
    .select('id')
    .eq('from_user_id', fromUserId)
    .eq('to_user_id', toUserId)
    .maybeSingle()

  if (existing) {
    throw new AppError('LIKE_ALREADY_SENT')
  }

  // 8. Insert like (DB trigger handle_match creates match + chat if mutual)
  const { error: insertError } = await supabase.from('likes').insert({
    from_user_id: fromUserId,
    to_user_id: toUserId,
  })

  if (insertError) {
    throw new AppError('SYSTEM_DATABASE_ERROR', {
      cause: insertError,
      logContext: { fromUserId, toUserId },
    })
  }

  // 9. Check if match was created (mutual like)
  const { data: match } = await supabase
    .from('matches')
    .select('id')
    .or(`user_a.eq.${fromUserId},user_b.eq.${fromUserId}`)
    .or(`user_a.eq.${toUserId},user_b.eq.${toUserId}`)
    .maybeSingle()

  const matched = !!match

  // 10. Insert notifications for both users
  if (matched) {
    await supabase.from('notifications').insert([
      {
        user_id: toUserId,
        type: 'match',
        title_key: 'notification.match.title',
        body_key: 'notification.match.body',
        payload: { match_id: match.id },
        entity_id: match.id,
      },
      {
        user_id: fromUserId,
        type: 'match',
        title_key: 'notification.match.title',
        body_key: 'notification.match.body',
        payload: { match_id: match.id },
        entity_id: match.id,
      },
    ])
  }

  return { matched }
}
