import { createAdminClient } from '@/lib/supabase/admin'
import { checkLikeLimits } from './check-limits'
import { AppError } from '@/lib/errors/app-error'
import { inngest } from '@/lib/inngest/client'
import { createNotification } from '@/lib/notifications/factory'
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
export async function sendLike({ fromUserId, toUserId }: SendLikeParams): Promise<SendLikeResult> {
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
    // Fetch profile names so push/email notifications can personalise the body.
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', [fromUserId, toUserId])

    const nameOf = (id: string) => profiles?.find((p) => p.id === id)?.name ?? null

    // Route through Inngest notification dispatcher so push + email delivery
    // runs with retries. Use 'match_created' — the canonical NotificationType.
    const matchPayload = createNotification('match_created', {
      recipientId: toUserId,
      actorId: fromUserId,
      actorName: nameOf(fromUserId) ?? undefined,
      matchId: data.match_id,
      entityId: data.match_id,
      entityType: 'match',
    })
    const matchPayloadFrom = createNotification('match_created', {
      recipientId: fromUserId,
      actorId: toUserId,
      actorName: nameOf(toUserId) ?? undefined,
      matchId: data.match_id,
      entityId: data.match_id,
      entityType: 'match',
    })

    await Promise.all([
      inngest
        .send({
          name: 'notification/send',
          data: {
            type: 'match_created',
            payload: matchPayload,
            userId: toUserId,
            dedupeKey: `match_created:${data.match_id}:${toUserId}`,
          },
        })
        .catch((err: unknown) =>
          console.error(
            JSON.stringify({
              level: 'error',
              message: 'match_notification_dispatch_failed',
              match_id: data.match_id,
              userId: toUserId,
              error: (err as Error).message,
            }),
          ),
        ),
      inngest
        .send({
          name: 'notification/send',
          data: {
            type: 'match_created',
            payload: matchPayloadFrom,
            userId: fromUserId,
            dedupeKey: `match_created:${data.match_id}:${fromUserId}`,
          },
        })
        .catch((err: unknown) =>
          console.error(
            JSON.stringify({
              level: 'error',
              message: 'match_notification_dispatch_failed',
              match_id: data.match_id,
              userId: fromUserId,
              error: (err as Error).message,
            }),
          ),
        ),
    ])
  }

  return {
    matched: data.matched,
    ...(data.match_id ? { match_id: data.match_id } : {}),
  }
}
