const ALLOWED_PUSH_ORIGINS = [
  'https://fcm.googleapis.com',
  'https://updates.push.services.mozilla.com',
  'https://web.push.apple.com',
]

const ALLOWED_WILDCARD_ORIGINS = ['https://*.notify.windows.com']

export function validatePushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:') return false

    if (ALLOWED_PUSH_ORIGINS.includes(url.origin)) return true

    for (const pattern of ALLOWED_WILDCARD_ORIGINS) {
      const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '[^.]+') + '$',
      )
      if (regex.test(url.origin)) return true
    }

    return false
  } catch {
    return false
  }
}
