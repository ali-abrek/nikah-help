# 11 — Idempotency System

## Purpose

This file defines the complete idempotency system for the Nikah Help API — a reusable `withIdempotency()` wrapper for Next.js Route Handlers, built on Upstash Redis. It ensures that duplicate requests (network retries, double-clicks, mobile app retry policies) produce the same result as the first successful request, preventing double charges, duplicate likes, and repeat messages.

**Target audience:** AI development agents (Claude Code) and senior fullstack engineers.

> **MANDATORY OBSERVABILITY (idempotency):** Idempotency conflicts on payment webhooks are a fraud/replay signal. Per [14-sentry-observability.md](14-sentry-observability.md):
> * `flow=payments.webhook` with `reason=conflict` — webhook idempotency conflict. Severity: warning.
> * Failure to reach Upstash for the idempotency lookup itself: `flow=ratelimit.infra` (shared infra). Severity: error.
> * Idempotency key, `provider_payment_id`, and route are acceptable tags. Request bodies MUST NOT be sent.

---

## Requirement: Architecture

### Scenario: A client retries a mutation request

**Given** a mutation endpoint (payment, like, message)
**When** the client sends the same request twice (same idempotency key)
**Then** the first request executes normally and its result is cached
**And** the second request receives the cached result without re-executing the handler
**And** the response is identical (status, body, relevant headers)

```
Request 1 (Idempotency-Key: abc-123)
  │
  ▼
┌──────────────────────────┐
│  withIdempotency()       │
│  1. Validate key format  │
│  2. Acquire lock (SETNX) │
│  3. Lock acquired → run  │
│  4. Store result in Redis│
│  5. Return response      │
└──────────────────────────┘

Request 2 (Idempotency-Key: abc-123) — arrives while Request 1 is processing
  │
  ▼
┌──────────────────────────┐
│  withIdempotency()       │
│  1. Validate key format  │
│  2. Acquire lock (SETNX) │
│  3. Lock NOT acquired →  │
│  4. Poll for result      │
│  5. Return cached result │
└──────────────────────────┘

Request 3 (Idempotency-Key: abc-123) — arrives after Request 1 has completed
  │
  ▼
┌──────────────────────────┐
│  withIdempotency()       │
│  1. Validate key format  │
│  2. Acquire lock (SETNX) │
│  3. Lock NOT acquired →  │
│  4. Read cached result   │
│  5. Return cached result │
└──────────────────────────┘
```

### Design Constraints

- **Wrapper, not middleware.** Applied per-endpoint. Only mutation endpoints need idempotency; read endpoints don't.
- **Atomic lock acquisition.** Redis Lua script (SETNX + EXPIRE) ensures no two requests can acquire the same lock, even under race conditions.
- **Client-provided key.** The client generates a UUID v4 and sends it as `Idempotency-Key` header. The server validates the format.
- **Key scoping by user.** Keys are scoped to `{userId}:{uuid}` to prevent cross-user collisions. Even if two users generate the same UUID (astronomically unlikely), their keys don't collide.
- **Fail-open.** If Redis is unreachable, the lock acquisition fails and the request proceeds. Idempotency is a safety net, not a hard requirement. A 3s timeout prevents cascading failures.
- **Only 2xx responses are cached.** Errors (4xx, 5xx) release the lock so the client can retry with the same key.
- **Compatible with the error taxonomy.** Uses `IDEMPOTENCY_*` codes from `09-error-handling.md`.

---

## Requirement: API Design

### `withIdempotency(handler, options)`

```typescript
// lib/idempotency/with-idempotency.ts
import { NextRequest, NextResponse } from 'next/server'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'
import { resolveIdempotencyKey } from './keys'
import { acquireLock, storeResult, waitForResult, releaseLock } from './redis'
import { filterHeaders } from './headers'
import type { IdempotencyOptions } from './types'

export function withIdempotency<T>(
  handler: (request: NextRequest, context: T) => Promise<NextResponse>,
  options: IdempotencyOptions = {},
) {
  const ttl = options.ttl ?? 86_400       // 24 hours
  const timeout = options.timeout ?? 30_000 // 30 seconds
  const required = options.required ?? false

  return async (request: NextRequest, context: T): Promise<NextResponse> => {
    const keyHeader = request.headers.get('idempotency-key')

    // If no key and not required, proceed without idempotency
    if (!keyHeader && !required) {
      return handler(request, context)
    }

    // If no key and required, reject
    if (!keyHeader && required) {
      throw new AppError('IDEMPOTENCY_KEY_MISSING')
    }

    try {
      const redisKey = await resolveIdempotencyKey(request, keyHeader!)
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      throw new AppError('IDEMPOTENCY_KEY_INVALID', {
        cause: error instanceof Error ? error : undefined,
      })
    }

    try {
      const redisKey = await resolveIdempotencyKey(request, keyHeader!)

      // Step 1: Try to acquire the lock
      const acquired = await acquireLock(redisKey, ttl)

      if (acquired) {
        // Step 2a: Lock acquired — execute the handler
        let response: NextResponse
        try {
          response = await handler(request, context)
        } catch (error) {
          // Handler threw — release lock so client can retry
          await releaseLock(redisKey)
          throw error
        }

        // Step 3a: Cache 2xx responses only
        if (response.status >= 200 && response.status < 300) {
          await storeResult(redisKey, response, ttl)
        } else {
          // 4xx/5xx — release lock so client can retry with same key
          await releaseLock(redisKey)
        }

        return response
      }

      // Step 2b: Lock NOT acquired — someone else has it
      // Wait for the result (polls every 50ms up to `timeout`)
      const cached = await waitForResult(redisKey, timeout)

      if (cached) {
        // Step 3b: Reconstruct the cached response
        return new NextResponse(cached.body, {
          status: cached.status,
          headers: cached.headers,
        })
      }

      // Step 4: Timeout — the original request may have failed silently
      // Return 409 to tell the client to generate a new key and retry
      throw new AppError('IDEMPOTENCY_CONFLICT', {
        logContext: { redisKey, timeout },
      })

    } catch (error) {
      if (error instanceof AppError) {
        return handleRouteError(error)
      }
      // Redis failure — fail open, proceed without idempotency
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'Idempotency store unavailable, failing open',
        error: (error as Error).message,
      }))
      return handler(request, context)
    }
  }
}
```

### `IdempotencyOptions`

```typescript
// lib/idempotency/types.ts

interface IdempotencyOptions {
  /**
   * Whether the idempotency key is required.
   * If true, requests without the header are rejected with 422.
   * Default: false (idempotency is best-effort for non-critical endpoints).
   */
  required?: boolean

  /**
   * TTL for the idempotency lock and cached result, in seconds.
   * After this time, the key can be reused.
   * Default: 86400 (24 hours).
   */
  ttl?: number

  /**
   * Maximum time to wait for a concurrent request's result, in milliseconds.
   * After this time, a 409 is returned.
   * Default: 30000 (30 seconds).
   */
  timeout?: number
}
```

### Presets

```typescript
// lib/idempotency/presets.ts
import type { IdempotencyOptions } from './types'

/** Payment endpoints — idempotency is critical. Key is mandatory. */
export const PAYMENT_CRITICAL: IdempotencyOptions = {
  required: true,
  ttl: 86_400,    // 24 hours — T-Bank order expiry window
  timeout: 60_000, // 60 seconds — payments can be slow
}

/** User actions — likes, blocks, reports. Best-effort idempotency. */
export const USER_ACTION: IdempotencyOptions = {
  required: false,
  ttl: 3600,       // 1 hour
  timeout: 10_000,  // 10 seconds
}

/** Chat messages — recommended but not critical. */
export const MESSAGE_SEND: IdempotencyOptions = {
  required: false,
  ttl: 600,         // 10 minutes
  timeout: 5_000,    // 5 seconds
}
```

---

## Requirement: Key Management

### Key Format

```
idempotency:{scope}:{userId}:{uuid}
```

| Part | Value | Example |
|---|---|---|
| `idempotency` | Fixed prefix | `idempotency` |
| `{scope}` | `user` (authenticated) or `ip` (unauthenticated) | `user` |
| `{userId}` | User ID from `x-user-id` header, or hashed IP for unauthenticated | `a1b2c3d4...` |
| `{uuid}` | Client-provided UUID v4 | `550e8400-e29b-41d4-a716-446655440000` |

Full key example: `idempotency:user:a1b2c3d4-e5f6-7890:550e8400-e29b-41d4-a716-446655440000`

### Key Resolution

```typescript
// lib/idempotency/keys.ts
import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { AppError } from '@/lib/errors/app-error'

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function resolveIdempotencyKey(
  request: NextRequest,
  key: string,
): Promise<string> {
  // 1. Validate UUID v4 format
  const trimmed = key.trim()
  if (!UUID_V4_RE.test(trimmed)) {
    throw new AppError('IDEMPOTENCY_KEY_INVALID', {
      message: 'Idempotency-Key must be a valid UUID v4',
      logContext: { providedKey: obfuscate(trimmed) },
    })
  }

  // 2. Resolve scope
  const userId = request.headers.get('x-user-id')

  if (userId) {
    return `idempotency:user:${userId}:${trimmed}`
  }

  // 3. Unauthenticated — scope by IP
  const ip = extractIp(request)
  return `idempotency:ip:${ip}:${trimmed}`
}

function extractIp(request: NextRequest): string {
  const cf = request.headers.get('cf-connecting-ip')
  if (cf) return hashIp(cf)

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return hashIp(forwarded.split(',')[0]!.trim())

  return hashIp(request.headers.get('x-real-ip') ?? '127.0.0.1')
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16)
}

function obfuscate(value: string): string {
  return value.slice(0, 8) + '...'
}
```

### Why User-Scoped Keys

Without user scoping, two users generating the same UUID (nearly impossible but defensive) would collide. With user scoping, the key is `{userId}:{uuid}`, so:

- User A's key `user:A:uuid-123` and User B's key `user:B:uuid-123` are independent
- A malicious user cannot exhaust another user's idempotency keys
- Redis key space is naturally partitioned by user

---

## Requirement: Redis Operations

### Lock Acquisition (Atomic SETNX + EXPIRE)

```typescript
// lib/idempotency/redis.ts
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  enableAutoPipelining: true,
})

/**
 * Atomically acquire an idempotency lock.
 * Uses a Lua script to combine SETNX + EXPIRE in one atomic operation.
 * Returns true if the lock was acquired, false if it already exists.
 */
export async function acquireLock(key: string, ttl: number): Promise<boolean> {
  const script = `
    if redis.call('SETNX', KEYS[1], ARGV[1]) == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[2])
      return 1
    end
    return 0
  `
  const result = await redis.eval(script, [key], ['pending', String(ttl)])
  return result === 1
}
```

The Lua script is safe: it's executed server-side by Redis, not in the Node.js process. The `eval` call is Redis's `EVAL` command, not JavaScript `eval()`.

### Store Result

```typescript
import { filterHeaders } from './headers'

interface StoredResponse {
  status: number
  body: string
  headers: Record<string, string>
}

/**
 * Store the successful response in Redis.
 * Overwrites the "pending" marker with the full serialized response.
 */
export async function storeResult(
  key: string,
  response: NextResponse,
  ttl: number,
): Promise<void> {
  const body = await response.clone().text()

  const stored: StoredResponse = {
    status: response.status,
    body,
    headers: filterHeaders(response.headers),
  }

  await redis.set(key, JSON.stringify(stored), { ex: ttl })
}
```

### Poll for Result (waitForResult)

```typescript
/**
 * Poll for the result of a concurrent request.
 * Checks every 50ms until the stored value is no longer "pending"
 * or the timeout is reached.
 *
 * Returns the StoredResponse if found, null if timed out.
 */
export async function waitForResult(
  key: string,
  timeoutMs: number,
): Promise<StoredResponse | null> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const raw = await redis.get<string>(key)

    if (raw && raw !== 'pending') {
      try {
        return JSON.parse(raw) as StoredResponse
      } catch {
        // Corrupted value — treat as not found
        return null
      }
    }

    // Key doesn't exist (expired or releaseLock deleted it) → the original
    // request likely failed. Don't poll indefinitely.
    if (raw === null) {
      return null
    }

    // Still "pending" — wait and retry
    await sleep(50)
  }

  return null // Timeout
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

### Release Lock

```typescript
/**
 * Delete the pending lock marker.
 * ONLY deletes if the value is still "pending" — never deletes a stored result.
 * This prevents a late-arriving releaseLock() from destroying a cached result
 * that was just written by storeResult().
 */
export async function releaseLock(key: string): Promise<void> {
  const script = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    end
    return 0
  `
  await redis.eval(script, [key], ['pending'])
}
```

This guard is critical. Without it, this race could occur:

```
Time  Request 1                Request 2
──────────────────────────────────────────────────
t1    handler() completes
t2    storeResult() writes {status:200, body:...}
t3                              releaseLock() DEL key  ← WRONG! Would delete the stored result
```

With the guard: `releaseLock()` checks `GET key == "pending"` before deleting. At t3, the value is the stored JSON (not "pending"), so the DEL is skipped.

### Response Header Filtering

```typescript
// lib/idempotency/headers.ts

const ALLOWLISTED_HEADERS = new Set([
  'content-type',
  'cache-control',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
])

/**
 * Filter response headers for idempotency replay.
 * Only allowlists essential headers. Never caches:
 * - Set-Cookie (session-specific)
 * - X-Request-Id (unique per request)
 * - Date (changes)
 * - Connection, Transfer-Encoding (hop-by-hop)
 */
export function filterHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}

  headers.forEach((value, key) => {
    if (ALLOWLISTED_HEADERS.has(key.toLowerCase())) {
      result[key] = value
    }
  })

  return result
}
```

---

## Requirement: Error Handling

### Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `IDEMPOTENCY_KEY_MISSING` | 422 | `Idempotency-Key` header is required but missing (only when `required: true`) |
| `IDEMPOTENCY_KEY_INVALID` | 422 | `Idempotency-Key` is not a valid UUID v4 |
| `IDEMPOTENCY_CONFLICT` | 409 | A concurrent request with the same key is still processing and timed out. Client should generate a new key and retry. |

These codes are defined in the [error code registry](./09-error-handling.md#code-registry).

### Response Examples

**Missing key (required endpoint):**
```json
{
  "code": "IDEMPOTENCY_KEY_MISSING",
  "message": "Требуется заголовок Idempotency-Key",
  "trace_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": 422
}
```

**Invalid key format:**
```json
{
  "code": "IDEMPOTENCY_KEY_INVALID",
  "message": "Idempotency-Key должен быть в формате UUID v4",
  "trace_id": "b2c3d4e5-f6a7-8901-bcde-fa2345678901",
  "status": 422
}
```

**Concurrent request timeout:**
```json
{
  "code": "IDEMPOTENCY_CONFLICT",
  "message": "Запрос уже выполняется. Попробуйте снова с новым ключом.",
  "trace_id": "c3d4e5f6-a7b8-9012-cdef-ab3456789012",
  "status": 409
}
```

### i18n Messages

```json
// messages/ru.json (partial)
{
  "errors": {
    "IDEMPOTENCY_KEY_MISSING": "Требуется заголовок Idempotency-Key",
    "IDEMPOTENCY_KEY_INVALID": "Idempotency-Key должен быть в формате UUID v4",
    "IDEMPOTENCY_CONFLICT": "Запрос уже выполняется. Попробуйте снова с новым ключом."
  }
}

// messages/en.json (partial)
{
  "errors": {
    "IDEMPOTENCY_KEY_MISSING": "Idempotency-Key header is required",
    "IDEMPOTENCY_KEY_INVALID": "Idempotency-Key must be a valid UUID v4",
    "IDEMPOTENCY_CONFLICT": "Request is already in progress. Try again with a new key."
  }
}
```

---

## Requirement: Composition with Rate Limiting

### Correct Order

Rate limiting wraps idempotency — rate limit is checked FIRST:

```typescript
// app/api/payments/init/route.ts
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { withIdempotency } from '@/lib/idempotency/with-idempotency'
import { PAYMENT_CRITICAL } from '@/lib/idempotency/presets'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'

async function handler(request: NextRequest): Promise<NextResponse> {
  // ... payment logic
}

export const POST = withRateLimit(
  withIdempotency(handler, PAYMENT_CRITICAL),
  ACTION_MODERATE,
)
```

Rationale:
1. **Rate limit first.** If an attacker floods requests with different idempotency keys, rate limiting catches it before idempotency touches Redis. Rate limiting is cheaper (single counter increment) than idempotency (lock acquisition + potential polling).
2. **Idempotency second.** Once rate limiting passes, idempotency ensures the handler runs at most once per key.
3. **Error handling inner.** The idempotency wrapper catches handler errors and releases the lock. The rate limit wrapper catches AppError from idempotency key validation (422) and returns a proper error response.

---

## Requirement: Client Contract

### What the client MUST do

1. **Generate a UUID v4 per idempotent operation.** Use `crypto.randomUUID()` in the browser or `uuid v4` in mobile apps.
2. **Send it as the `Idempotency-Key` request header.**
3. **Reuse the SAME key on retry.** If the request fails with a network error or 5xx, retry with the same key. The server will return the cached result if the original request succeeded.
4. **Generate a NEW key for a new attempt.** If the server returns 409 (`IDEMPOTENCY_CONFLICT`), the original request timed out — generate a fresh key and retry.
5. **Never reuse keys.** After a successful response, the key is consumed. For the next operation, generate a new key.

### What the client MUST NOT do

```typescript
// ❌ Generate a new key per retry — defeats idempotency
async function payWithRetry(amount: number) {
  const retry = async () => {
    const key = crypto.randomUUID() // NEW key each time!
    const res = await fetch('/api/payments/init', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify({ amount }),
    })
    if (!res.ok) throw new Error('Failed')
    return res.json()
  }
  return withRetry(retry, { maxAttempts: 3 })
}

// ✅ Reuse the same key on retry
async function payWithRetry(amount: number) {
  const key = crypto.randomUUID() // ONE key for this operation
  const retry = async () => {
    const res = await fetch('/api/payments/init', {
      method: 'POST',
      headers: { 'Idempotency-Key': key }, // SAME key on retry
      body: JSON.stringify({ amount }),
    })
    if (!res.ok) throw new Error('Failed')
    return res.json()
  }
  return withRetry(retry, { maxAttempts: 3 })
}
```

### Client helper

```typescript
// lib/idempotency/client.ts

/**
 * Generate a UUID v4 for use as an idempotency key.
 * Uses the Web Crypto API — available in all modern browsers and React Native.
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}
```

---

## Requirement: Integration Examples

### Example 1: Payment Initiation (critical)

```typescript
// app/api/payments/init/route.ts
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { withIdempotency } from '@/lib/idempotency/with-idempotency'
import { PAYMENT_CRITICAL } from '@/lib/idempotency/presets'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'
import { AppError } from '@/lib/errors/app-error'
import { initPayment } from '@/features/payments/server/init'

async function handler(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request)
  const body = await request.json()

  // T-Bank Init API call — this is the side effect we must not duplicate
  const payment = await initPayment({
    userId: user.id,
    amount: body.amount,
    orderId: crypto.randomUUID(),
  })

  return NextResponse.json(payment)
}

// Rate limit outer, idempotency inner
export const POST = withRateLimit(
  withIdempotency(handler, PAYMENT_CRITICAL),
  ACTION_MODERATE,
)
```

Client usage:
```typescript
const key = generateIdempotencyKey()

const res = await fetch('/api/payments/init', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': key,
  },
  body: JSON.stringify({ amount: 990 }),
})

if (res.status === 409) {
  // IDEMPOTENCY_CONFLICT — first attempt timed out, retry with new key
  const newKey = generateIdempotencyKey()
  // retry with newKey...
}
```

### Example 2: Send Like (best-effort)

```typescript
// app/api/likes/send/route.ts
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { withIdempotency } from '@/lib/idempotency/with-idempotency'
import { USER_ACTION } from '@/lib/idempotency/presets'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'
import { sendLike } from '@/features/likes/server/send-like'

async function handler(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request)
  const { targetUserId } = await request.json()

  await sendLike(user.id, targetUserId)

  return NextResponse.json({ success: true })
}

export const POST = withRateLimit(
  withIdempotency(handler, USER_ACTION),
  ACTION_MODERATE,
)
```

### Example 3: Send Message (recommended)

```typescript
// app/api/chat/send-message/route.ts
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { withIdempotency } from '@/lib/idempotency/with-idempotency'
import { MESSAGE_SEND as IDEMPOTENCY_MESSAGE } from '@/lib/idempotency/presets'
import { MESSAGE_SEND as RATELIMIT_MESSAGE } from '@/lib/ratelimit/presets'
import { sendMessage } from '@/features/chat/server/send-message'

async function handler(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request)
  const body = await request.json()

  const message = await sendMessage(user.id, body)

  return NextResponse.json(message, { status: 201 })
}

export const POST = withRateLimit(
  withIdempotency(handler, IDEMPOTENCY_MESSAGE),
  RATELIMIT_MESSAGE,
)
```

---

## Requirement: Security

### Cross-User Key Collision Prevention

Keys are scoped by user ID: `idempotency:user:{userId}:{uuid}`. Two users generating the same UUID produce different Redis keys. This is defense-in-depth — UUID v4 collision probability is already negligible (`~2.7 × 10^-16` for 1 billion keys).

### Key Enumeration

An attacker cannot enumerate idempotency keys to discover other users' operations:
- Keys contain UUIDs, which are unguessable
- Even if an attacker knows a UUID, they'd need the target user's ID to construct the full key
- Redis is not directly exposed to clients

### Replay Attacks

Stored results are safe to replay:
- Only 2xx responses are cached — never auth tokens or session cookies
- `Set-Cookie` headers are never cached (not in the allowlist)
- Result TTL is capped at 24 hours; keys auto-expire

### Redis Failure — Fail Open

```typescript
// In the wrapper's catch block:
console.warn(JSON.stringify({
  level: 'warn',
  message: 'Idempotency store unavailable, failing open',
  error: (error as Error).message,
}))
return handler(request, context)
```

During a Redis outage, idempotency is disabled and requests proceed without deduplication. This is acceptable because:
- Redis outage is rare (Upstash SLA: 99.99%)
- Blocking all mutations would be far worse than risking a duplicate
- Critical payment endpoints have additional idempotency at the T-Bank API level

---

## Requirement: Performance

### Latency Budget

| Component | Target |
|---|---|
| `resolveIdempotencyKey()` (no DB) | < 0.1ms |
| `acquireLock()` — Redis SETNX + EXPIRE (Lua) | < 5ms |
| `storeResult()` — Redis SET | < 5ms |
| `waitForResult()` — poll loop (50ms intervals) | 0–30s |
| `withIdempotency()` overhead (lock acquired) | < 10ms |

### Optimizations

1. **Single Redis call for lock acquisition.** The Lua script combines SETNX + EXPIRE in one round-trip.
2. **No DB queries in the hot path.** User ID comes from `x-user-id` header set by `proxy.ts`.
3. **Polling, not blocking.** `waitForResult()` polls at 50ms intervals with a timeout. This keeps the event loop free for other requests.
4. **`enableAutoPipelining: true`** on the Upstash Redis client — batches commands when applicable.
5. **No global middleware.** Only mutation endpoints use idempotency. Reads are unaffected.

---

## Requirement: Observability

### Logging

```typescript
// Lock acquired → debug level
console.debug(JSON.stringify({
  level: 'debug',
  event: 'idempotency.lock_acquired',
  key: obfuscate(redisKey),
  ttl,
}))

// Lock not acquired → info level (concurrent request)
console.info(JSON.stringify({
  level: 'info',
  event: 'idempotency.lock_conflict',
  key: obfuscate(redisKey),
}))

// Result served from cache → info level
console.info(JSON.stringify({
  level: 'info',
  event: 'idempotency.cache_hit',
  key: obfuscate(redisKey),
}))

// Timeout waiting for result → warn level
console.warn(JSON.stringify({
  level: 'warn',
  event: 'idempotency.timeout',
  key: obfuscate(redisKey),
  timeout,
}))

// Redis failure → warn level
console.warn(JSON.stringify({
  level: 'warn',
  event: 'idempotency.redis_failure',
  action: 'fail_open',
  error: (error as Error).message,
}))
```

### What NOT to log

- Raw UUID (log first 8 chars only: `obfuscate(key)`)
- User IDs in plaintext (use first 8 chars)
- Request bodies or response bodies
- Any PII

### Alert Thresholds

| Condition | Action |
|---|---|
| `idempotency.timeout` > 10 in 5 min | Slack alert (handler is too slow or stuck) |
| `idempotency.redis_failure` > 5 in 5 min | Pager alert (Upstash outage) |
| Single user with > 100 distinct idempotency keys in 5 min | Slack alert (possible abuse — generating excessive keys) |

---

## Requirement: Extensibility

### Adding Body Hash Validation (Future)

For additional safety, the server can hash the request body and store it alongside the result. On retry, compare the body hash to detect mismatches:

```typescript
// Future addition to resolveIdempotencyKey()
const bodyHash = createHash('sha256')
  .update(await request.clone().text())
  .digest('hex')

// Store alongside the result:
await redis.set(key, JSON.stringify({
  ...stored,
  bodyHash,
}), { ex: ttl })

// On cache hit, verify the body matches:
if (cached.bodyHash !== bodyHash) {
  throw new AppError('IDEMPOTENCY_KEY_INVALID', {
    message: 'Idempotency-Key reused with different request body',
  })
}
```

### Adding Per-Endpoint TTL Overrides

The `IdempotencyOptions` already supports `ttl`. For dynamic TTL based on endpoint, extend the presets or pass inline options:

```typescript
// Short TTL for non-critical operations
export const REPORT_SUBMIT: IdempotencyOptions = {
  required: false,
  ttl: 300,        // 5 minutes
  timeout: 5_000,   // 5 seconds
}
```

### Adding Batch Operation Support

For batch endpoints (e.g., bulk photo upload), accept multiple idempotency keys:

```typescript
// Future: Idempotency-Key: uuid1, uuid2, uuid3
// Each key maps to one item in the batch array
// The server checks all keys before executing any of them
```

---

## File Summary

```
lib/idempotency/
├── types.ts                # IdempotencyOptions, StoredResponse types
├── keys.ts                 # resolveIdempotencyKey() — UUID validation + scoping
├── redis.ts                # acquireLock(), storeResult(), waitForResult(), releaseLock()
├── headers.ts              # filterHeaders() — response header allowlist
├── with-idempotency.ts     # withIdempotency() wrapper
├── presets.ts              # PAYMENT_CRITICAL, USER_ACTION, MESSAGE_SEND
└── client.ts               # generateIdempotencyKey() — browser helper
```

---

## Cross-References

- [00 — Overview & Architecture Principles](./00-overview.md) — Upstash Redis in tech stack
- [05 — Payments (T-Bank)](./05-payments.md) — payment idempotency requirements
- [07 — Infrastructure, Testing & i18n](./07-infrastructure.md) — Vercel Cron jobs, monitoring
- [09 — Error Handling System](./09-error-handling.md) — IDEMPOTENCY_* error codes, AppError class
- [10 — Rate Limiting System](./10-rate-limiting.md) — withRateLimit() wrapper, composition order
