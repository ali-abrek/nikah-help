'use client'

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

export async function registerPushSubscription(userId: string): Promise<PushSubscription | null> {
  if (!PUBLIC_KEY) {
    console.warn('VAPID public key not configured')
    return null
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications not supported')
    return null
  }

  try {
    // Register service worker
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready

    // Check existing subscription
    let subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      // Already subscribed — verify the key matches
      const existingKey = subscription.options?.applicationServerKey
      if (existingKey) {
        const keyBytes = new Uint8Array(
          atob(PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/'))
            .split('')
            .map((c) => c.charCodeAt(0)),
        )
        // Simple check: unsubscribe and re-subscribe if key changed
        // (full key comparison is complex, so just re-subscribe if needed)
        const currentKey = btoa(
          String.fromCharCode(...new Uint8Array(existingKey)),
        ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

        if (currentKey !== PUBLIC_KEY) {
          await subscription.unsubscribe()
          subscription = null
        }
      }
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(PUBLIC_KEY),
      })
    }

    // Save subscription to server
    const parsed = JSON.parse(JSON.stringify(subscription))
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: parsed.endpoint,
        keys: parsed.keys,
      }),
    })

    if (!res.ok) {
      console.error('Failed to save push subscription')
    }

    return subscription
  } catch (err) {
    console.error('Push subscription failed:', err)
    return null
  }
}

export async function unsubscribePush(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await subscription.unsubscribe()
    }
    await fetch('/api/push/unsubscribe', { method: 'POST' })
  } catch (err) {
    console.error('Push unsubscribe failed:', err)
  }
}

function urlB64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray as Uint8Array<ArrayBuffer>
}
