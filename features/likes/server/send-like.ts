import { createAdminClient } from '@/lib/supabase/admin'
import { checkLikeLimits } from './check-limits'
import { AppError } from '@/lib/errors/app-error'
import type { ErrorCode } from '@/lib/errors/registry'

interface SendLikeParams {
  fromUserId: string
  toUserId: string
}

interface SendLikeResult {
  matched: boolean
  match_id?: string
}

interface SendLikeRpcRow {
  matched: boolean
  match_id: string | null
  error_code: string | null
}

/**
 * Send a like from `fromUserId` to `toUserId`.
 *
 * All structural validation, block-pair check, and match detection happens in
 * a single SECURITY DEFINER Postgres function (`send_like`). Premium/quota
 * gating remains here because it depends on subscription state we cache
 * outside Postgres.
 */
export async function sendLike({
  fromUserId,
  toUserId,
}: SendLikeParams): Promise<SendLikeResult> {
  const supabase = createAdminClient()

  // Quota check (subscription-aware) — kept in app layer.
  await checkLikeLimits(supabase, fromUserId)

  const { data, error } = await supabase
    .rpc('send_like', { p_from: fromUserId, p_to: toUserId } as never)
    .single<SendLikeRpcRow>()

  if (error || !data) {
    throw new AppError('SYSTEM_DATABASE_ERROR', {
      cause: error ?? undefined,
      logContext: { fromUserId, toUserId },
    })
  }

  if (data.error_code) {
    throw new AppError(data.error_code as ErrorCode, {
      logContext: { fromUserId, toUserId },
    })
  }

  if (data.matched && data.match_id) {
    // Notification fan-out is best-effort — failures here must not poison the
    // like itself. Inngest dispatcher already handles retries for delivery.
    const { error: notifErr } = await supabase.from('notifications').insert([
      {
        user_id: toUserId,
        type: 'match',
        title_key: 'notification.match.title',
        body_key: 'notification.match.body',
        payload: { match_id: data.match_id },
        entity_id: data.match_id,
      },
      {
        user_id: fromUserId,
        type: 'match',
        title_key: 'notification.match.title',
        body_key: 'notification.match.body',
        payload: { match_id: data.match_id },
        entity_id: data.match_id,
      },
    ])
    if (notifErr) {
      console.error(JSON.stringify({
        level: 'error',
        message: 'match_notification_insert_failed',
        match_id: data.match_id,
        error: notifErr.message,
      }))
    }
  }

  return {
    matched: data.matched,
    ...(data.match_id ? { match_id: data.match_id } : {}),
  }
}
