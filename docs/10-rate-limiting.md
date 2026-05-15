# 10 — Rate Limiting System

## Purpose

This file defines the complete rate limiting system for the Nikah Help API — a reusable `withRateLimit()` wrapper for Next.js Route Handlers, built on Upstash Redis + `@upstash/ratelimit`. It replaces all inline rate limiting logic with a single, configurable, testable abstraction.

**Target audience:** AI development agents (Claude Code) and senior fullstack engineers.

> **MANDATORY OBSERVABILITY (rate limiting):** A rate limiter that fails open is a silent DDoS surface. Per [14-sentry-observability.md](14-sentry-observability.md):
>
> - `flow=ratelimit.infra` — any failure to reach Upstash Redis (timeout, auth error, network). Severity: error. **Any occurrence pages on-call.**
> - `flow=ratelimit.abuse` — abuse threshold exceeded by a single principal (e.g., > 10× the configured limit in 1 min). Severity: warning. Tag with `user_role` and `route` — not the IP, not the email.
>
> Normal rate-limited 429 responses MUST NOT be reported as exceptions. Only infra failures and abuse signals.

---

## Requirement: Architecture

### Scenario: Rate limiting is applied to a Route Handler

**Given** any Route Handler that needs rate limiting
**When** a request arrives
**Then** the `withRateLimit()` wrapper intercepts BEFORE the handler executes
**And** returns a standardized 429 error if the limit is exceeded
**And** passes the request through if within limits

```
Request
  │
  ▼
┌─────────────────────┐
│  withRateLimit()    │
│  1. Resolve keys    │
│  2. Check Upstash   │
│  3. If over limit:  │
│     → 429 + headers │
│  4. If ok:          │
│     → handler(req)  │
└─────────────────────┘
  │
  ▼
Route Handler
```

### Design Constraints

- **Wrapper, not middleware.** Applied per-route, not globally. Different endpoints need different limits; a global middleware can't express this without complex config.
- **Zero additional latency on cache hit.** Upstash Redis round-trip is the only cost. No DB queries, no JWT parsing (user already resolved by the handler or upstream).
- **Fails open.** If Upstash is unreachable, the request proceeds. Rate limiting is a safety net, not a hard security boundary. A 3s timeout on the Redis call prevents cascading failures.
- **Compatible with the error taxonomy.** Rate limit errors use the `RATE_LIMIT_*` codes from `09-error-handling.md`.

---

## Requirement: API Design

### `withRateLimit(handler, options)`

```typescript
// lib/ratelimit/with-rate-limit.ts
import { NextRequest, NextResponse } from 'next/server'
import { ratelimit } from './client'
import { resolveKeys } from './keys'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'
import type { RateLimitOptions } from './types'

export function withRateLimit<T>(
  handler: (request: NextRequest, context: T) => Promise<NextResponse>,
  options: RateLimitOptions,
) {
  return async (request: NextRequest, context: T): Promise<NextResponse> => {
    try {
      const keys = await resolveKeys(request, options.keyStrategy)
      const result = await ratelimit.limit(keys, options)

      if (!result.success) {
        throw new AppError(options.errorCode ?? 'RATE_LIMIT_TOO_MANY_REQUESTS', {
          logContext: {
            keys: keys.map((k) => `${k.prefix}:${obfuscate(k.value)}`),
            limit: options.limit,
            window: options.window,
            reset: result.reset,
          },
        })
      }

      return handler(request, context)
    } catch (error) {
      if (error instanceof AppError) {
        // Preserve the AppError shape; log it and return the response
        return handleRouteError(error)
      }
      // Unexpected errors from Upstash → fail open, log, proceed
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: 'Rate limiter unavailable, failing open',
          error: (error as Error).message,
        }),
      )
      return handler(request, context)
    }
  }
}
```

### `RateLimitOptions`

```typescript
// lib/ratelimit/types.ts
import type { ErrorCode } from '@/lib/errors/registry'

type KeyStrategy = 'ip' | 'user' | 'ip+user'

interface RateLimitOptions {
  /** Maximum number of requests within the window. */
  limit: number

  /** Time window duration in seconds (e.g. 60 = 1 minute). */
  window: number

  /** Which identifier(s) to rate-limit on. */
  keyStrategy: KeyStrategy

  /**
   * Error code for the 429 response.
   * Default: 'RATE_LIMIT_TOO_MANY_REQUESTS'
   * Override to get per-endpoint error messages and client behavior.
   */
  errorCode?: ErrorCode

  /**
   * Optional — role-based override.
   * Users with these roles bypass rate limiting entirely.
   * Default: ['admin', 'moderator']
   */
  bypassRoles?: string[]
}
```

### Per-Route Presets

Pre-built configurations for common patterns. Use these directly instead of repeating raw options:

```typescript
// lib/ratelimit/presets.ts
import type { RateLimitOptions } from './types'

/** Auth endpoints — very strict. Prevents brute-force Magic Link sending. */
export const AUTH_STRICT: RateLimitOptions = {
  limit: 10,
  window: 60, // 10 requests per minute
  keyStrategy: 'ip',
  errorCode: 'RATE_LIMIT_AUTH_CALLBACK',
  bypassRoles: [], // No role bypass — auth endpoints have no user yet
}

/** Sensitive actions — moderate. Likes, reports, blocks. */
export const ACTION_MODERATE: RateLimitOptions = {
  limit: 30,
  window: 60, // 30 requests per minute
  keyStrategy: 'user',
  errorCode: 'RATE_LIMIT_TOO_MANY_REQUESTS',
}

/** Chat messages — per-user throughput. */
export const MESSAGE_SEND: RateLimitOptions = {
  limit: 30,
  window: 60, // 30 messages per minute
  keyStrategy: 'user',
  errorCode: 'RATE_LIMIT_MESSAGE_SEND',
}

/** Read endpoints — generous. Feed, profile views, photo streaming. */
export const READ_GENEROUS: RateLimitOptions = {
  limit: 120,
  window: 60, // 120 requests per minute
  keyStrategy: 'ip+user',
  errorCode: 'RATE_LIMIT_TOO_MANY_REQUESTS',
}

/** Photo uploads — prevent abuse. */
export const PHOTO_UPLOAD: RateLimitOptions = {
  limit: 20,
  window: 60, // 20 uploads per minute
  keyStrategy: 'user',
  errorCode: 'RATE_LIMIT_TOO_MANY_REQUESTS',
}

/** Webhook endpoints — generous. T-Bank, Inngest callbacks. */
export const WEBHOOK: RateLimitOptions = {
  limit: 300,
  window: 60, // 300 per minute — bursts are normal for webhooks
  keyStrategy: 'ip',
  errorCode: 'RATE_LIMIT_TOO_MANY_REQUESTS',
}
```

---

## Requirement: Storage Layer

### Upstash Redis Client

```typescript
// lib/ratelimit/client.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  enableAutoPipelining: true, // Batch Redis commands in a single HTTP request
})

/**
 * Single shared Ratelimit instance.
 * Uses sliding-window algorithm — more accurate than fixed-window
 * because it prevents burst-at-boundary attacks.
 */
export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '60 s'), // Placeholder — overridden per-call
  analytics: true, // Enable for Upstash dashboard visibility
  timeout: 3000, // 3s — fail open if Redis is unresponsive
})
```

### Key Structure

Keys are composite strings built from the resolved identifiers:

```
nikah-help:{endpoint}:{key_type}:{key_value}
```

| Part          | Value                      | Example                                          |
| ------------- | -------------------------- | ------------------------------------------------ |
| `nikah-help`  | Fixed namespace            | `nikah-help`                                     |
| `{endpoint}`  | Route path, normalized     | `api/photos/stream`, `api/auth/callback`         |
| `{key_type}`  | `ip`, `user`, or `ip+user` | `user`                                           |
| `{key_value}` | Hashed identifier          | `sha256(192.168.1.1)` for IP, `user_id` for user |

When `keyStrategy = 'ip+user'`, two separate keys are checked (AND logic — both must be under limit). This prevents a single IP from exhausting a user's quota and vice versa.

### Key Resolution

```typescript
// lib/ratelimit/keys.ts
import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import type { KeyStrategy } from './types'

interface RateLimitKey {
  prefix: string
  value: string
}

export async function resolveKeys(
  request: NextRequest,
  strategy: KeyStrategy,
): Promise<RateLimitKey[]> {
  const path = normalizePath(request.nextUrl.pathname)
  const keys: RateLimitKey[] = []

  if (strategy === 'ip' || strategy === 'ip+user') {
    keys.push({
      prefix: `nikah-help:${path}:ip`,
      value: extractIp(request),
    })
  }

  if (strategy === 'user' || strategy === 'ip+user') {
    const userId = await resolveUserId(request)
    if (userId) {
      keys.push({
        prefix: `nikah-help:${path}:user`,
        value: userId,
      })
    }
    // If no user ID and strategy requires it: fall back to IP-only.
    // This handles unauthenticated requests without crashing.
  }

  // Safety net: if no keys could be resolved, fall back to IP
  if (keys.length === 0) {
    keys.push({
      prefix: `nikah-help:${path}:ip`,
      value: extractIp(request),
    })
  }

  return keys
}

/**
 * Extract client IP, respecting proxy headers.
 * Vercel sets x-forwarded-for with the real client IP as the first entry.
 * Cloudflare sets cf-connecting-ip.
 */
function extractIp(request: NextRequest): string {
  const cf = request.headers.get('cf-connecting-ip')
  if (cf) return hashIp(cf)

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return hashIp(forwarded.split(',')[0]!.trim())

  // Fallback — may be inaccurate behind unknown proxies
  return hashIp(request.headers.get('x-real-ip') ?? '127.0.0.1')
}

/** One-way hash IPs so raw addresses are never stored in Redis or logs. */
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16)
}

/** Normalize route path for key grouping (strip dynamic segments). */
function normalizePath(pathname: string): string {
  return pathname
    .replace(/^\/api\//, '')
    .replace(/\/[0-9a-f-]{36}/g, ':id') // UUID → :id
    .replace(/\//g, '.') // / → .
}

async function resolveUserId(request: NextRequest): Promise<string | null> {
  // Read from a header set by proxy.ts after session refresh.
  // This avoids a second Supabase round-trip in every rate-limit call.
  return request.headers.get('x-user-id') ?? null
}
```

### TTL Strategy

The sliding window implementation in `@upstash/ratelimit` handles TTL automatically:

- Each request increments a counter with the configured window as TTL
- When the window expires, the counter is automatically cleaned up by Redis
- No manual cleanup needed — no `pg_cron` job for rate limit keys

---

## Requirement: Response Format

### Scenario: Rate limit is exceeded

**Given** a request that exceeds the configured limit
**When** `ratelimit.limit()` returns `{ success: false }`
**Then** the response is:

```json
{
  "code": "RATE_LIMIT_TOO_MANY_REQUESTS",
  "message": "Слишком много запросов. Попробуйте через минуту.",
  "trace_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": 429
}
```

### Response Headers

Standard rate-limit headers are set on every response (both success and 429):

```typescript
// Added to the response by the wrapper
response.headers.set('X-RateLimit-Limit', String(options.limit))
response.headers.set('X-RateLimit-Remaining', String(result.remaining))
response.headers.set('X-RateLimit-Reset', String(result.reset))
```

On 429, additionally:

```
Retry-After: <seconds until reset>
```

These headers enable:

- Frontend: show remaining quota in dev tools
- Load testing: verify limits are enforced
- Mobile clients: back off before hitting 429
- Cloudflare: layer additional WAF rules on top

### Error Codes

| Code                           | Default For       | Customizable?                     |
| ------------------------------ | ----------------- | --------------------------------- |
| `RATE_LIMIT_TOO_MANY_REQUESTS` | Generic limit hit | Yes — pass `errorCode` in options |
| `RATE_LIMIT_AUTH_CALLBACK`     | Auth callback     | Yes                               |
| `RATE_LIMIT_MESSAGE_SEND`      | Message sending   | Yes                               |

Custom error codes from `09-error-handling.md` (like `BIO_RATE_LIMITED`, `REPORT_RATE_LIMITED`) are used when the limit is a **business rule** (3 bio regenerations per 24h), not an infrastructure rule. Those go through `AppError`, not the rate limiter wrapper.

---

## Requirement: Integration Examples

### Example 1: Public Auth Endpoint (IP-based, strict)

```typescript
// app/api/auth/callback/route.ts
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { AUTH_STRICT } from '@/lib/ratelimit/presets'

export const GET = withRateLimit(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/auth?error=auth_callback_failed', request.url))
  }

  // ... exchange code for session
  return NextResponse.redirect(new URL('/feed', request.url))
}, AUTH_STRICT)
```

### Example 2: Authenticated Action (User-based, moderate)

```typescript
// features/likes/server/send-like.ts (called from a Route Handler)
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'

// app/api/likes/send/route.ts
export const POST = withRateLimit(async (request: NextRequest) => {
  const user = await getAuthenticatedUser(request) // Throws AUTH_UNAUTHORIZED if no session
  const { targetUserId } = await request.json()

  // Business logic — throws AppError on limit, block, etc.
  await sendLike(user.id, targetUserId)

  return NextResponse.json({ success: true })
}, ACTION_MODERATE)
```

### Example 3: Chat Messages (User-based, with custom error code)

```typescript
// app/api/chat/send-message/route.ts
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { MESSAGE_SEND } from '@/lib/ratelimit/presets'

export const POST = withRateLimit(async (request: NextRequest) => {
  const user = await getAuthenticatedUser(request)
  const body = await request.json()
  const message = await sendMessage(user.id, body)
  return NextResponse.json(message)
}, MESSAGE_SEND)
```

### Example 4: Read-Heavy Endpoint (ip+user)

```typescript
// app/api/photos/stream/route.ts
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { READ_GENEROUS } from '@/lib/ratelimit/presets'

export const GET = withRateLimit(async (request: NextRequest) => {
  const user = await getAuthenticatedUser(request)
  const { photoId, variant, fmt } = parseParams(request)

  // ... stream photo bytes
  return new Response(file, { headers: { 'Content-Type': contentType } })
}, READ_GENEROUS)
```

### Example 5: Custom Configuration (inline)

```typescript
// app/api/admin/reports/route.ts
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'

export const GET = withRateLimit(
  async (request: NextRequest) => {
    const reports = await getReports()
    return NextResponse.json(reports)
  },
  {
    limit: 60,
    window: 60,
    keyStrategy: 'user',
    errorCode: 'RATE_LIMIT_TOO_MANY_REQUESTS',
    bypassRoles: ['admin', 'moderator'], // Moderators and admins are never rate-limited
  },
)
```

### Example 6: Server Actions (manual call)

Server Actions can't use the Route Handler wrapper directly (they're not HTTP handlers). Instead, call the ratelimit client inline:

```typescript
// features/likes/actions.ts
'use server'

import { ratelimit } from '@/lib/ratelimit/client'
import { AppError } from '@/lib/errors/app-error'
import { getClaims } from '@/lib/supabase/server'

export async function sendLike(targetUserId: string) {
  const claims = await getClaims()
  if (!claims) throw new AppError('AUTH_UNAUTHORIZED')

  // Rate limit check
  const { success } = await ratelimit.limit([`nikah-help:likes.send:user:${claims.sub}`], {
    limit: 30,
    window: 60,
  })
  if (!success) {
    throw new AppError('RATE_LIMIT_TOO_MANY_REQUESTS')
  }

  // Business logic...
}
```

For consistency, prefer extracting business logic into `features/<feature>/server/*.ts` helpers that both the Route Handler and Server Action call. This way the rate limit wrapper is applied once at the Route Handler level.

---

## Requirement: Role-Based Bypass

### Scenario: Moderator is never rate-limited

**Given** a user with `role IN ('admin', 'moderator')`
**When** they hit any rate-limited endpoint
**Then** the rate limit check is skipped entirely.

The wrapper reads `x-user-role` header (set by `proxy.ts` after session refresh):

```typescript
// Inside withRateLimit(), before the ratelimit.limit() call:
const userRole = request.headers.get('x-user-role')
const bypassRoles = options.bypassRoles ?? ['admin', 'moderator']
if (userRole && bypassRoles.includes(userRole)) {
  return handler(request, context) // Bypass — no Redis call
}
```

`proxy.ts` sets the header after `getClaims()`:

```typescript
// app/proxy.ts (relevant excerpt)
requestHeaders.set('x-user-id', claims.sub)
requestHeaders.set('x-user-role', claims.role)
```

This avoids a DB round-trip in the rate limiter — the role is already resolved by the proxy.

---

## Requirement: Security

### IP Spoofing Prevention

1. **Trusted proxy chain:** On Vercel, `x-forwarded-for` is set by Vercel's edge, not by the client. The first IP in the list is the real client.
2. **Cloudflare `cf-connecting-ip`:** Used as the primary source when available (it's tamper-proof — set by Cloudflare, not the client).
3. **IP hashing:** Raw IPs are never stored in Redis or logs. SHA-256 truncated to 16 chars prevents reconstruction.

### Unauthenticated User Handling

When `keyStrategy = 'user'` or `ip+user` and no user ID is available:

- `resolveKeys()` falls back to IP-only for that key slot
- The `x-user-id` header is not set by `proxy.ts` for unauthenticated routes (public routes bypass the proxy)
- This means unauthenticated requests are effectively IP-limited, which is the correct behavior

### Redis Failure — Fail Open

```typescript
// The Ratelimit client has timeout: 3000 (3 seconds).
// If Redis is unreachable for 3 seconds, the promise rejects.
// The wrapper catches this and proceeds without limiting.
// This prevents Redis outage from taking down the entire API.

// In the wrapper's catch block:
console.warn(
  JSON.stringify({
    level: 'warn',
    message: 'Rate limiter unavailable, failing open',
    error: (error as Error).message,
  }),
)
return handler(request, context)
```

Trade-off: during a Redis outage, rate limiting is disabled. This is acceptable because:

- Redis outage is rare (Upstash SLA: 99.99%)
- Blocking all requests would be far worse than allowing them
- The 3s timeout prevents request queuing from overwhelming the server

---

## Requirement: Performance

### Latency Budget

| Component                          | Target               |
| ---------------------------------- | -------------------- |
| Upstash Redis round-trip (HTTP)    | < 10ms (same region) |
| `resolveKeys()` (no DB queries)    | < 0.1ms              |
| `withRateLimit()` overhead (total) | < 15ms               |

### Optimizations

1. **Single Redis call per check.** `@upstash/ratelimit` sliding window implementation uses a Lua script that atomically increments the counter and checks the limit in one round-trip.

2. **No DB queries in the hot path.** User ID and role come from headers set by `proxy.ts`. `proxy.ts` runs once per request and sets these. The rate limiter reads headers, not the database.

3. **`enableAutoPipelining: true`** on the Upstash Redis client — batches multiple Redis commands when `ip+user` strategy checks two keys.

4. **No global rate limit middleware.** Middleware would run on every request (including static assets, Next.js internals). Per-route wrapping means rate limiting only runs where needed.

5. **Presets eliminate repeated option objects.** `AUTH_STRICT`, `MESSAGE_SEND`, etc. are static references — no allocation per request for common configs.

---

## Requirement: Observability

### Logging

Every rate limit hit logs structured data:

```typescript
// Inside the wrapper, when result.success === false:
console.warn(
  JSON.stringify({
    level: 'warn',
    event: 'rate_limit.hit',
    code: options.errorCode ?? 'RATE_LIMIT_TOO_MANY_REQUESTS',
    path: request.nextUrl.pathname,
    keys: keys.map((k) => `${k.prefix}:${obfuscate(k.value)}`),
    limit: options.limit,
    window: options.window,
    remaining: result.remaining,
    reset: result.reset,
    timestamp: new Date().toISOString(),
  }),
)
```

### What NOT to log

- Raw IP addresses (hashed only)
- User IDs in plaintext (use first 8 chars only: `obfuscate(id)`)
- Request bodies or query parameters
- Headers besides rate-limit-specific ones

### Metrics

Upstash dashboard provides:

- Request count per key
- Blocked vs allowed ratio
- P99 latency

Additional monitoring via a periodic Vercel Cron job:

```typescript
// app/api/cron/rate-limit-metrics/route.ts
// Runs every 5 minutes. Queries Upstash for top blocked keys.
// If a single key is blocked > 100 times in 5 min → alert.
```

### Alert Thresholds

| Condition                                | Action                                   |
| ---------------------------------------- | ---------------------------------------- |
| Single IP blocked > 100 times in 5 min   | Slack alert (possible abuse)             |
| Single user blocked > 50 times in 5 min  | Slack alert (possible automation)        |
| Overall block rate > 10% of all requests | Slack alert (misconfiguration or attack) |
| Redis connection errors > 5 in 5 min     | Pager alert (Upstash outage)             |

---

## Requirement: Extensibility

### Adding a New Key Strategy

```typescript
// lib/ratelimit/keys.ts — add a new case to resolveKeys()

type KeyStrategy = 'ip' | 'user' | 'ip+user' | 'device' | 'country'

if (strategy === 'device') {
  const deviceId = request.headers.get('x-device-id')
  if (deviceId) {
    keys.push({
      prefix: `nikah-help:${path}:device`,
      value: deviceId,
    })
  }
}

if (strategy === 'country') {
  const country = request.headers.get('cf-ipcountry') ?? 'unknown'
  keys.push({
    prefix: `nikah-help:${path}:country`,
    value: country,
  })
}
```

New strategies are additive — existing presets are unaffected.

### Adding a New Preset

```typescript
// lib/ratelimit/presets.ts

/** Photo moderation webhook — very generous, internal service. */
export const MODERATION_WEBHOOK: RateLimitOptions = {
  limit: 500,
  window: 60,
  keyStrategy: 'ip',
  errorCode: 'RATE_LIMIT_TOO_MANY_REQUESTS',
  bypassRoles: ['admin', 'moderator'],
}
```

### Evolving Limits

Limits are configuration, not code. To change a limit, update the preset:

```typescript
// Before
export const MESSAGE_SEND: RateLimitOptions = {
  limit: 30, // 30 messages per minute
  window: 60,
  // ...
}

// After — double the throughput
export const MESSAGE_SEND: RateLimitOptions = {
  limit: 60, // 60 messages per minute
  window: 60,
  // ...
}
```

No behavior changes, no code restructuring. The preset name stays the same.

For more dynamic control (without deploy), use environment variables:

```typescript
export const MESSAGE_SEND: RateLimitOptions = {
  limit: parseInt(process.env.RATELIMIT_MESSAGE_SEND_LIMIT ?? '30', 10),
  window: parseInt(process.env.RATELIMIT_MESSAGE_SEND_WINDOW ?? '60', 10),
  keyStrategy: 'user',
  errorCode: 'RATE_LIMIT_MESSAGE_SEND',
}
```

This allows adjusting limits via Vercel env vars without a deploy.

### Adding PostHog Tracking

For future integration — emit a PostHog event on rate limit hits:

```typescript
// Inside the wrapper, after logging:
if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  // Fire-and-forget — don't block the response
  fetch('https://app.posthog.com/capture/', {
    method: 'POST',
    body: JSON.stringify({
      api_key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      event: 'rate_limit_hit',
      properties: {
        code: options.errorCode,
        path: request.nextUrl.pathname,
        // No PII — only hashed keys
      },
    }),
  }).catch(() => {
    /* ignore */
  })
}
```

---

## File Summary

```
lib/ratelimit/
├── types.ts             # RateLimitOptions, KeyStrategy type
├── client.ts            # Upstash Redis + Ratelimit instance
├── keys.ts              # resolveKeys() — IP/user/ip+user resolution
├── with-rate-limit.ts   # withRateLimit() wrapper
├── presets.ts           # AUTH_STRICT, ACTION_MODERATE, MESSAGE_SEND, etc.
└── headers.ts           # Helpers to set X-RateLimit-* response headers
```

---

## Cross-References

- [00 — Overview & Architecture Principles](./00-overview.md) — Upstash Redis in tech stack
- [07 — Infrastructure, Testing & i18n](./07-infrastructure.md) — Vercel Cron jobs
- [09 — Error Handling System](./09-error-handling.md) — RATE*LIMIT*\* error codes
