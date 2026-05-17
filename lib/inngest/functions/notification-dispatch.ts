import { inngest, notificationSendEvent } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPresence } from '@/lib/realtime/presence'
import { requireEnv } from '@/lib/env'
import { captureSentryException } from '@/lib/sentry/capture'
import type { NotificationPayload } from '@/lib/notifications/types'

interface NotificationEvent {
  type: string
  payload: NotificationPayload
  userId: string
  channels?: string[]
  // Optional caller-supplied uniqueness key. When set, the inserted row
  // collides on (user_id, dedupe_key) so a duplicate event doesn't produce
  // a duplicate notification.
  dedupeKey?: string
}

export const notificationDispatchFn = inngest.createFunction(
  {
    id: 'notification.dispatch',
    retries: 3,
    triggers: [notificationSendEvent],
    onFailure: async ({ event, error }) => {
      const { userId } = event.data as { userId?: string }
      await captureSentryException(error, {
        flow: 'notif.send',
        severity: 'error',
        tags: { step: 'retry_exhausted' },
        extra: { traceId: userId ?? 'unknown' },
      })
    },
  },
  async ({ event, step }) => {
    const { payload, userId, channels = [], dedupeKey } = event.data as NotificationEvent

    // Step 1: Check notification preferences
    const preferencesEnabled = await step.run('check-preferences', async () => {
      const supabase = createAdminClient()
      const { data: pref } = await supabase
        .from('notification_preferences')
        .select('enabled')
        .eq('user_id', userId)
        .eq('type', payload.payload.type)
        .maybeSingle()

      // If no preference row exists, default to enabled
      return pref?.enabled ?? true
    })

    if (!preferencesEnabled) {
      return { status: 'skipped', reason: 'disabled_by_preferences' }
    }

    // Step 2: Insert notification into DB. Use upsert(onConflict=dedupe_key)
    // when a key was supplied so duplicate events become a no-op insert.
    await step.run('insert-notification', async () => {
      const supabase = createAdminClient()
      const row = {
        user_id: userId,
        type: payload.payload.type,
        title_key: payload.title_key,
        body_key: payload.body_key,
        payload: payload.payload,
        entity_id: payload.payload.entity_id ?? null,
        ...(dedupeKey ? { dedupe_key: dedupeKey } : {}),
      }

      const builder = dedupeKey
        ? supabase
            .from('notifications')
            .upsert(row, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
        : supabase.from('notifications').insert(row)

      const { error } = await builder

      if (error) {
        void captureSentryException(error, {
          flow: 'notif.send',
          severity: 'error',
          tags: { step: 'insert_notification' },
        })
        throw error
      }
    })

    // Step 3: Check user presence — skip push if online
    const isOnline = await step.run('check-presence', async () => {
      return getPresence(userId)
    })

    // Step 4: Send Web Push if user is offline.
    // Each subscription is wrapped in its own step.run keyed by subscriptionId
    // so a retry doesn't re-push to subscriptions that already succeeded.
    if (!isOnline) {
      const supabase = createAdminClient()
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('id, kind, endpoint, auth, p256dh, device_token, locale')
        .eq('user_id', userId)

      if (subs?.length) {
        const webpush = await import('web-push')

        webpush.default.setVapidDetails(
          requireEnv('VAPID_EMAIL'),
          requireEnv('VAPID_PUBLIC_KEY'),
          requireEnv('VAPID_PRIVATE_KEY'),
        )

        const validSubs = subs.filter(
          (sub) => sub.kind === 'web' && sub.endpoint && sub.auth && sub.p256dh,
        )

        await Promise.all(
          validSubs.map((sub) =>
            step.run(`push-sub-${sub.id}`, async () => {
              try {
                await webpush.default.sendNotification(
                  {
                    endpoint: sub.endpoint!,
                    keys: { auth: sub.auth!, p256dh: sub.p256dh! },
                  },
                  JSON.stringify(payload),
                )
                return { pushed: true, subId: sub.id }
              } catch (err) {
                const e = err as { statusCode?: number; message?: string }
                if (e.statusCode === 410 || e.statusCode === 404) {
                  await supabase.from('push_subscriptions').delete().eq('id', sub.id)
                  return { pushed: false, subId: sub.id, expired: true }
                }
                void captureSentryException(err, {
                  flow: 'notif.send',
                  severity: 'warning',
                  tags: { step: 'web_push' },
                  extra: { channel: 'push', subscriptionId: String(sub.id) },
                })
                return { pushed: false, subId: sub.id }
              }
            }),
          ),
        )
      }
    }

    // Step 5: Send Email if requested
    if (channels.includes('email')) {
      await step.run('send-email', async () => {
        const supabase = createAdminClient()
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .single()

        if (!profile?.email) return { sent: false }

        const { getEmailTemplate } = await import('@/lib/resend/templates')
        const { sendEmail } = await import('@/lib/resend/client')
        const template = getEmailTemplate(payload.payload.type, payload)

        const { success, error } = await sendEmail({
          to: profile.email,
          subject: template.subject,
          html: template.html,
        })

        if (!success) {
          void captureSentryException(new Error(error ?? 'email send failed'), {
            flow: 'notif.send',
            severity: 'error',
            tags: { step: 'send_email' },
            extra: { channel: 'email' },
          })
        }

        return { sent: success }
      })
    }

    return { status: 'ok' }
  },
)
