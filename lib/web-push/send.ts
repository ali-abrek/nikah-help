import type { NotificationPayload } from '@/lib/notifications/types'
import { requireEnv } from '@/lib/env'
import { validatePushEndpoint } from '@/lib/web-push/validate-endpoint'

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { auth: string; p256dh: string } },
  payload: NotificationPayload,
): Promise<boolean> {
  if (!validatePushEndpoint(subscription.endpoint)) {
    return false
  }

  try {
    const webpush = await import('web-push')

    webpush.default.setVapidDetails(
      requireEnv('VAPID_EMAIL'),
      requireEnv('VAPID_PUBLIC_KEY'),
      requireEnv('VAPID_PRIVATE_KEY'),
    )

    await webpush.default.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          auth: subscription.keys.auth,
          p256dh: subscription.keys.p256dh,
        },
      },
      JSON.stringify(payload),
    )

    return true
  } catch (err) {
    const e = err as { statusCode?: number }
    // 410 Gone = subscription expired, 404 = not found
    if (e.statusCode === 410 || e.statusCode === 404) {
      return false // Caller should clean up the subscription
    }
    throw err
  }
}
