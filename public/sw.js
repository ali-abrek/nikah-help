self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()
    const { title_key, body_key, payload } = data

    const title = title_key ?? 'NikahHelp'
    const body = body_key ?? ''
    const link = payload?.link ?? null

    const options = {
      body,
      icon: '/icon-192.png',
      badge: '/icon-96.png',
      data: { link },
      tag: payload?.type ?? 'general',
      requireInteraction: false,
    }

    event.waitUntil(self.registration.showNotification(title, options))
  } catch {
    // If parsing fails, show a generic notification
    event.waitUntil(
      self.registration.showNotification('NikahHelp', {
        body: 'New notification',
        icon: '/icon-192.png',
      }),
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const link = event.notification.data?.link

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // If a window is already open, focus it and navigate
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus()
            if (link) {
              client.postMessage({ type: 'navigate', url: link })
            }
            return
          }
        }
        // Otherwise open a new window
        const target = link ? `${self.location.origin}${link}` : self.location.origin
        return self.clients.openWindow(target)
      }),
  )
})

// Notify the client that the SW is ready for push
self.addEventListener('message', (event) => {
  if (event.data?.type === 'PUSH_READY') {
    const client = event.source
    if (client) {
      client.postMessage({ type: 'PUSH_READY_ACK' })
    }
  }
})
