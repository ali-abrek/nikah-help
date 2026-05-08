import type { NotificationPayload } from '@/lib/notifications/types'

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { auth: string; p256dh: string } },
  payload: NotificationPayload,
): Promise<boolean> {
  try {
    const webpush = await import('web-push')

    webpush.default.setVapidDetails(
      process.env.VAPID_EMAIL!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
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
  } catch (err: any) {
    // 410 Gone = subscription expired, 404 = not found
    if (err.statusCode === 410 || err.statusCode === 404) {
      return false // Caller should clean up the subscription
    }
    throw err
  }
}
