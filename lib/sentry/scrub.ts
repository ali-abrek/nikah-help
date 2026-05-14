import type { Event } from '@sentry/nextjs'

// Header names that must always be stripped before an event leaves the process.
const BLOCKED_HEADERS = new Set([
  'cookie',
  'authorization',
  'x-api-key',
  'x-sentry-token',
  'set-cookie',
])

// Body field names that may carry PII.
const BLOCKED_BODY_FIELDS = new Set([
  'email',
  'password',
  'phone',
  'chat_message',
  'message_text',
  'photo_url',
  'token',
])

// Query-string parameter names that must be stripped.
const BLOCKED_QUERY_PARAMS = new Set(['code', 'token', 'access_token', 'refresh_token', 'apikey'])

// Matches Supabase signed Storage URLs and any param name that looks sensitive.
const SENSITIVE_PARAM_PATTERN = /(?:token|secret|key|signature)/i

function scrubHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return headers
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase()
    if (BLOCKED_HEADERS.has(lower)) continue
    if (/token|secret|key/.test(lower)) continue
    // x-forwarded-for: keep only the first IP (prevents full chain fingerprinting)
    if (lower === 'x-forwarded-for') {
      out[name] = value.split(',')[0]?.trim() ?? value
      continue
    }
    out[name] = value
  }
  return out
}

function scrubQueryString(url: string | undefined): string | undefined {
  if (!url) return url
  try {
    const parsed = new URL(url, 'https://placeholder.invalid')
    const toDelete: string[] = []
    for (const param of parsed.searchParams.keys()) {
      if (BLOCKED_QUERY_PARAMS.has(param) || SENSITIVE_PARAM_PATTERN.test(param)) {
        toDelete.push(param)
      }
    }
    if (toDelete.length === 0) return url
    toDelete.forEach((p) => parsed.searchParams.delete(p))
    // Reconstruct: keep only path + cleaned search, drop the fake origin
    return parsed.pathname + (parsed.search ? parsed.search : '')
  } catch {
    // Intentionally suppressed: unparseable URLs are returned unchanged.
    // Risk: a malformed URL may contain un-scrubbed tokens. Acceptable because
    // sendDefaultPii:false and header scrubbing are the primary defence layers.
    return url
  }
}

function scrubBodyFields(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (BLOCKED_BODY_FIELDS.has(key.toLowerCase())) continue
    out[key] = value
  }
  return out
}

// Shared beforeSend / beforeSendTransaction hook. Applied in all three SDK
// configs (server, edge, client). Returns null to drop the event.
// Generic over event subtype so the return type matches the input (satisfies both
// beforeSend<ErrorEvent> and beforeSendTransaction<TransactionEvent>).
export function scrubPii<T extends Event>(event: T): T | null {
  // Drop debug-level events in production to prevent quota drain.
  if (event.level === 'debug' && process.env.NEXT_PUBLIC_SENTRY_ENV === 'production') {
    return null
  }

  if (event.request) {
    event.request.headers = scrubHeaders(
      event.request.headers as Record<string, string> | undefined,
    )
    event.request.url = scrubQueryString(event.request.url)
    if (event.request.data) {
      event.request.data = scrubBodyFields(event.request.data)
    }
    // Never send cookies or query string in the raw form
    delete event.request.cookies
    delete event.request.query_string
  }

  // Enforce id-only user context.
  if (event.user) {
    event.user = { id: event.user.id }
  }

  return event
}
