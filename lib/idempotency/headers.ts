const ALLOWLISTED_HEADERS = new Set([
  'content-type',
  'cache-control',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
])

export function filterHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}

  headers.forEach((value, key) => {
    if (ALLOWLISTED_HEADERS.has(key.toLowerCase())) {
      result[key] = value
    }
  })

  return result
}
