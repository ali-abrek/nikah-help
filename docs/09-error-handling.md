# 09 — Error Handling System

## Purpose

This file defines the complete error handling system for the Nikah Help API — response format, error code taxonomy, HTTP status mapping, error generation and handling in Route Handlers / Server Actions / proxy.ts, frontend consumption, logging, i18n, and extensibility rules.

**Target audience:** AI development agents (Claude Code) and senior fullstack engineers.

> **MANDATORY OBSERVABILITY:** This file is paired with [14-sentry-observability.md](14-sentry-observability.md), which defines the Sentry mandate. Every error path described here MUST satisfy the Sentry coverage requirements. In particular:
> * **No silent failures.** Every `catch` block MUST either (a) report via `captureSentryException` from `lib/sentry/` (or via `logError` for `AppError` instances), or (b) be a documented intentional suppression with an explanatory comment naming the risk and compensating control. Empty `catch {}` is a defect.
> * Direct calls to `Sentry.captureException` outside `lib/sentry/` are FORBIDDEN. Use the centralized helpers only.
> * Errors crossing a boundary MUST be `AppError` instances with `code`, `status`, `traceId`, `logContext.flow`, and `cause`.
> * 4xx errors on the mandatory-flow list (auth callback, payments, moderation, image pipeline, rate-limiter infra, cron) MUST still report to Sentry. The `shouldReportToSentry` helper below enforces this, using the code-to-flow mapping from `lib/sentry/capture.ts`.

---

## Requirement: Error Response Format

Every error response from the API MUST conform to this JSON schema.

### Scenario: API returns an error

**Given** any API endpoint (Route Handler, Server Action, proxy redirect)
**When** an error occurs
**Then** the response body MUST follow this structure:

```typescript
// lib/errors/types.ts
interface ErrorResponse {
  /** Machine-readable error code. Frontend switches on this. */
  code: string
  /** Human-readable summary in the user's language. Safe to display directly. */
  message: string
  /** Per-field validation errors, if applicable. Key = field path. */
  details?: Record<string, string>
  /** Unique identifier for this error occurrence. Cross-references logs. */
  trace_id: string
  /** HTTP status code (redundant with the response status line, included for logging conveniences). */
  status: number
}
```

### Example responses

```json
// Validation error (422)
{
  "code": "VALIDATION_INVALID_INPUT",
  "message": "Проверьте правильность заполнения полей",
  "details": {
    "birth_date": "Вам должно быть не менее 18 лет",
    "name": "Минимум 2 символа"
  },
  "trace_id": "c7e3a1b2-4f56-7890-abcd-ef1234567890",
  "status": 422
}

// Business error (409)
{
  "code": "LIKE_LIMIT_REACHED",
  "message": "Вы отправили 3 лайка, исчерпав лимит бесплатного тарифа. Чтобы продолжить пользоваться сервисом без ограничений, приобретите подписку.",
  "trace_id": "b8f4c2d3-5a67-8901-bcde-fa2345678901",
  "status": 409
}

// Auth error (401)
{
  "code": "AUTH_UNAUTHORIZED",
  "message": "Пожалуйста, войдите в аккаунт",
  "trace_id": "d9a5b3e4-6b78-9012-cdef-ab3456789012",
  "status": 401
}

// Rate limit (429)
{
  "code": "RATE_LIMIT_TOO_MANY_REQUESTS",
  "message": "Слишком много запросов. Попробуйте через минуту.",
  "trace_id": "e0b6c4f5-7c89-0123-defa-bc4567890123",
  "status": 429
}

// System error (500)
{
  "code": "SYSTEM_INTERNAL_ERROR",
  "message": "Что-то пошло не так. Попробуйте позже.",
  "trace_id": "f1c7d5a6-8d90-1234-efab-cd5678901234",
  "status": 500
}
```

### Server Action variant

Server Actions return a plain object (not an HTTP response), so the format is identical except `status` is informational:

```typescript
// Server Action return type
type ServerActionError = Omit<ErrorResponse, 'status'> & { status: number }
// status is included for uniformity; the client reads `code`, not status
```

Proxy-level errors (auth failures, suspensions) redirect to error pages instead of returning JSON. The error code is passed as a query param: `/error?code=AUTH_UNAUTHORIZED`.

---

## Requirement: Error Code Taxonomy

### Naming Convention

```
DOMAIN_REASON
```

- **DOMAIN:** broad category where the error originates (AUTH, VALIDATION, LIKE, PHOTO, etc.)
- **REASON:** specific condition in `SCREAMING_SNAKE_CASE`

All codes are uppercase with underscores. The registry below is the **single source of truth**. Client code switches on `code`, never on `message`.

### Code Registry

#### AUTH — Authentication & Authorization

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_UNAUTHORIZED` | 401 | No valid session (not logged in, session expired, cookie missing) |
| `AUTH_FORBIDDEN` | 403 | Authenticated but role insufficient (e.g., user accessing admin routes) |
| `AUTH_SUSPENDED` | 403 | Account is suspended/blocked by moderator. Redirect to `/blocked` |
| `AUTH_EMAIL_BANNED` | 403 | Email is on the moderator banlist. Cannot register |
| `AUTH_MAGIC_LINK_EXPIRED` | 401 | Magic Link code has expired |
| `AUTH_MAGIC_LINK_INVALID` | 401 | Magic Link code is invalid or already used |
| `AUTH_SESSION_EXPIRED` | 401 | Session cookie expired. Client must re-authenticate |

#### VALIDATION — Input Validation

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_INVALID_INPUT` | 422 | Generic validation failure. `details` map contains per-field errors |
| `VALIDATION_FILE_TOO_LARGE` | 422 | Upload exceeds size limit (photo > 10 MB, voice > 5 MB) |
| `VALIDATION_FILE_UNSUPPORTED_FORMAT` | 422 | Upload format not allowed (e.g., non-JPEG/PNG/WebP/AVIF) |
| `VALIDATION_IMAGE_TOO_SMALL` | 422 | Image dimensions below minimum (short side < 1000 px) |
| `VALIDATION_UNDERAGE` | 422 | Birth date fails ≥18 check at server level |

#### BUSINESS — Domain Logic

| Code | HTTP | Meaning |
|---|---|---|
| `LIKE_LIMIT_REACHED` | 409 | Free-tier male user has sent 3 lifetime likes. Offer subscription |
| `LIKE_ALREADY_SENT` | 409 | Duplicate like (idempotency hit or race) |
| `LIKE_OWN_PROFILE` | 422 | User attempted to like their own profile |
| `LIKE_TARGET_UNPUBLISHED` | 422 | Target profile is not published |
| `LIKE_BLOCKED` | 422 | Like rejected because one party blocked the other |
| `LIKE_GENDER_MISMATCH` | 422 | Target is same gender (enforced at DB level) |
| `MATCH_NOT_FOUND` | 404 | Match does not exist or was revoked |
| `CHAT_NOT_PARTICIPANT` | 403 | User is not a participant of this chat |
| `MESSAGE_EDIT_WINDOW_EXPIRED` | 409 | Edit attempted after 5-minute window |
| `MESSAGE_NOT_OWNER` | 403 | Edit/delete attempted on another user's message |
| `MESSAGE_NOT_TEXT` | 422 | Edit attempted on image or voice message |
| `MESSAGE_ALREADY_DELETED` | 409 | Edit/delete attempted on tombstoned message |
| `PHOTO_MAX_COUNT` | 409 | Profile already has 6 photos |
| `PHOTO_NOT_OWNER` | 403 | Photo operation on another user's photo |
| `PHOTO_ONLY_APPROVED_DELETED` | 409 | Cannot delete the only approved photo while profile is published |
| `PHOTO_POSITION_TAKEN` | 409 | Upload targeted a position that already has an approved photo |
| `PHOTO_STILL_PROCESSING` | 409 | Photo is still being processed or moderated |
| `PROFILE_NOT_PUBLISHED` | 422 | Action requires a published profile (e.g., sending like) |
| `PROFILE_GENDER_IMMUTABLE` | 422 | Attempt to change gender post-onboarding |
| `PROFILE_ONBOARDING_INCOMPLETE` | 409 | Authenticated user reached a feature that requires `onboarding_completed = true` (e.g. `/api/feed`). Client should redirect to `/onboarding`. |
| `PROFILE_NO_APPROVED_PHOTO` | 422 | Attempt to publish a profile that has zero approved photos. Returned by `togglePublish` when transitioning `false → true`. |
| `BLOCK_ALREADY_EXISTS` | 409 | User already blocked |
| `BLOCK_SELF` | 422 | Attempt to block own profile |
| `BIO_RATE_LIMITED` | 429 | AI bio regeneration exceeded 3 per 24h |
| `BIO_REGENERATION_IN_FLIGHT` | 409 | Another regeneration is already in progress |
| `SUBSCRIPTION_ALREADY_ACTIVE` | 409 | User already has an active subscription |
| `SUBSCRIPTION_NOT_FOUND` | 404 | No subscription exists for cancellation |
| `REPORT_RATE_LIMITED` | 429 | Exceeded 5 reports per day |
| `REPORT_SELF` | 422 | Attempt to report own profile or own photo |
| `CHAT_INITIATION_LIMIT` | 429 | Exceeded 10 new chat initiations per day |

#### PHOTO — Photo Pipeline

| Code | HTTP | Meaning |
|---|---|---|
| `PHOTO_PROCESSING_FAILED` | 500 | sharp pipeline failed (corrupted file, OOM) |
| `PHOTO_MODERATION_FAILED` | 500 | Moderation provider (OpenAI / DeepSeek) returned an error |
| `PHOTO_UPLOAD_FAILED` | 500 | Supabase Storage upload failed |
| `PHOTO_DOWNLOAD_FAILED` | 500 | Could not download original for processing |

#### PAYMENT — T-Bank

| Code | HTTP | Meaning |
|---|---|---|
| `PAYMENT_INIT_FAILED` | 502 | T-Bank Init API returned `Success: false` |
| `PAYMENT_SIGNATURE_INVALID` | 403 | Incoming webhook has invalid signature |
| `PAYMENT_AMOUNT_MISMATCH` | 422 | Client-specified amount doesn't match pricing plan |
| `PAYMENT_ORDER_EXPIRED` | 409 | OrderId has expired (T-Bank timeout) |

#### RATE_LIMIT — Rate Limiting

| Code | HTTP | Meaning |
|---|---|---|
| `RATE_LIMIT_TOO_MANY_REQUESTS` | 429 | Generic rate limit hit (Upstash) |
| `RATE_LIMIT_AUTH_CALLBACK` | 429 | Auth callback called too frequently |
| `RATE_LIMIT_MESSAGE_SEND` | 429 | Exceeded 30 messages/minute |

#### EXTERNAL — Third-Party Services

| Code | HTTP | Meaning |
|---|---|---|
| `EXTERNAL_OPENAI_FAILED` | 502 | OpenAI API error or timeout |
| `EXTERNAL_DEEPSEEK_FAILED` | 502 | DeepSeek API error or timeout (fallback for moderation) |
| `EXTERNAL_OPENAI_TIMEOUT` | 504 | OpenAI timed out (60s). Fallback provider used if available |
| `EXTERNAL_TBANK_FAILED` | 502 | T-Bank API unreachable or returned unexpected error |
| `EXTERNAL_RESEND_FAILED` | 502 | Resend email API error |
| `EXTERNAL_SUPABASE_STORAGE_FAILED` | 502 | Supabase Storage operation failed |

#### SYSTEM — Infrastructure

| Code | HTTP | Meaning |
|---|---|---|
| `SYSTEM_INTERNAL_ERROR` | 500 | Unhandled server error. Generic fallback |
| `SYSTEM_DATABASE_ERROR` | 500 | Postgres query error |
| `SYSTEM_TIMEOUT` | 504 | Route Handler exceeded Vercel timeout |
| `SYSTEM_MAINTENANCE` | 503 | Planned maintenance mode |

#### NOT_FOUND

| Code | HTTP | Meaning |
|---|---|---|
| `NOT_FOUND` | 404 | Resource does not exist (profile, photo, chat, etc.). Deliberately ambiguous — does not reveal whether the resource exists but is hidden |

---

## Requirement: HTTP Status Code Mapping

All error codes MUST map to a status code. The canonical mapping lives in `lib/errors/registry.ts`. Every `AppError` carries its HTTP status.

```
200–299 → NOT errors. Never return an error body with a 2xx status.
400     → Never used. Too generic.
401     → Auth-related: session missing, expired, invalid
403     → Auth-related: role insufficient, account suspended/banned
404     → Resource not found (ambiguous — never reveals hidden resources)
409     → Business logic conflict (limit reached, duplicate, state conflict)
422     → Validation failures, business rule violations for input
429     → Rate limiting
500     → Unhandled server errors
502     → External service failure
503     → Maintenance
504     → Timeout
```

Rules:
- Never return `400 Bad Request` — use `422 Unprocessable Entity` for all input/validation errors.
- Never return `403` for a resource that doesn't exist outside the user's visibility — use `404` to avoid leaking existence.
- `409 Conflict` is the primary business-logic error status (limits, duplicates, state conflicts).

---

## Requirement: Error Generation in Backend Code

### Scenario: A Route Handler or Server Action encounters an error

**Given** a backend function
**When** it needs to raise an error
**Then** it MUST throw an `AppError` instance:

```typescript
// lib/errors/app-error.ts
import type { ErrorCode } from './registry'

interface AppErrorOptions {
  /** Human-readable message. If omitted, uses the default i18n message for the code. */
  message?: string
  /** Per-field validation errors. Only for VALIDATION_INVALID_INPUT. */
  details?: Record<string, string>
  /** Original error for server-side logging. NEVER sent to client. */
  cause?: Error
  /** Additional structured data for logging. NEVER sent to client. */
  logContext?: Record<string, unknown>
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: Record<string, string>
  readonly cause?: Error
  readonly logContext?: Record<string, unknown>
  readonly traceId: string

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? code)
    this.name = 'AppError'
    this.code = code
    this.status = STATUS_MAP[code]
    this.details = options.details
    this.cause = options.cause
    this.logContext = options.logContext
    this.traceId = crypto.randomUUID()
  }

  /** Serialize to the client-facing ErrorResponse, stripping internal data. */
  toResponse(): ErrorResponse {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      trace_id: this.traceId,
      status: this.status,
    }
  }
}
```

### Scenario: Validating input with Zod

**Given** a Zod schema
**When** validation fails
**Then** the helper extracts per-field errors:

```typescript
// lib/errors/validation.ts
import { ZodError } from 'zod'
import { AppError } from './app-error'

export function validationError(zodError: ZodError, i18nPrefix = 'validation'): AppError {
  const details: Record<string, string> = {}
  for (const issue of zodError.issues) {
    const path = issue.path.join('.')
    if (!details[path]) {
      details[path] = issue.message // Zod v4 `error` property
    }
  }
  return new AppError('VALIDATION_INVALID_INPUT', { details })
}
```

### Scenario: Creating a business logic error

**Given** a Server Action checks a business rule
**When** the rule is violated
**Then** the action throws directly:

```typescript
// features/likes/server/send-like.ts
throw new AppError('LIKE_LIMIT_REACHED')
// The default i18n message for LIKE_LIMIT_REACHED is used.

throw new AppError('LIKE_LIMIT_REACHED', {
  message: 'You have sent 3 out of 3 likes. Subscribe to unlock unlimited likes.',
  logContext: { likesUsed: 3, limit: 3 },
})
```

### Patterns to avoid

```typescript
// ❌ Raw Error — no code, no structure
throw new Error('Like limit reached')

// ❌ Returning error objects instead of throwing
return { error: 'LIKE_LIMIT_REACHED' }

// ❌ Throwing with status code in message
throw new Error('409: Like limit reached')

// ❌ Stack trace or internal details leaking to client
throw new AppError('SYSTEM_INTERNAL_ERROR', { message: err.stack })
```

---

## Requirement: Error Handling in Boundaries

Errors are caught at system boundaries only. Internal code throws `AppError` freely. Handling happens in exactly three places.

### 1. Route Handlers

```typescript
// lib/errors/handler.ts
import { AppError } from './app-error'
import { NextResponse } from 'next/server'

export function handleRouteError(error: unknown): NextResponse<ErrorResponse> {
  if (error instanceof AppError) {
    logError(error)
    return NextResponse.json(error.toResponse(), { status: error.status })
  }

  // Unexpected error — wrap in generic
  const internal = new AppError('SYSTEM_INTERNAL_ERROR', {
    cause: error instanceof Error ? error : undefined,
  })
  logError(internal)
  return NextResponse.json(internal.toResponse(), { status: 500 })
}
```

Usage in every Route Handler:

```typescript
// app/api/photos/stream/route.ts
export async function GET(request: NextRequest) {
  try {
    // ... business logic
  } catch (error) {
    return handleRouteError(error)
  }
}
```

### 2. Server Actions

Server Actions return plain objects to the client via RSC. They use a similar wrapper that returns the error shape instead of NextResponse:

```typescript
// lib/errors/action.ts
import { AppError } from './app-error'

export type ServerActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: ErrorResponse }

export function handleActionError(error: unknown): { success: false; error: ErrorResponse } {
  if (error instanceof AppError) {
    logError(error)
    return { success: false, error: error.toResponse() }
  }

  const internal = new AppError('SYSTEM_INTERNAL_ERROR', {
    cause: error instanceof Error ? error : undefined,
  })
  logError(internal)
  return { success: false, error: internal.toResponse() }
}
```

Usage:

```typescript
// features/likes/actions.ts
'use server'

export async function sendLike(targetUserId: string): Promise<ServerActionResult<void>> {
  try {
    // ... business logic
    return { success: true, data: undefined }
  } catch (error) {
    return handleActionError(error)
  }
}
```

### 3. proxy.ts (Next.js 16 middleware)

proxy.ts handles errors BEFORE they reach a Route Handler — session refresh failures, suspension checks, rate limiting. It redirects, never returns JSON:

```typescript
// app/proxy.ts
import { NextResponse, NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const url = request.nextUrl.clone()

  try {
    // -- Auth / suspension checks --
    const claims = await supabase.auth.getClaims()

    if (!claims) {
      // No valid session — redirect to /auth
      url.pathname = '/auth'
      url.searchParams.set('error', 'AUTH_UNAUTHORIZED')
      return NextResponse.redirect(url)
    }

    const { data: suspended } = await supabase.rpc('is_user_suspended', { p_user: claims.sub })
    if (suspended) {
      await supabase.auth.signOut()
      url.pathname = '/blocked'
      return NextResponse.redirect(url)
    }

    // -- Continue --
    return updateSession(request)
  } catch (error) {
    // Unexpected proxy error → redirect to error page
    url.pathname = '/error'
    url.searchParams.set('code', 'SYSTEM_INTERNAL_ERROR')
    return NextResponse.redirect(url)
  }
}
```

---

## Requirement: Frontend Error Handling

### Scenario: Client calls an API route

**Given** a TanStack Query hook
**When** the API returns an error
**Then** the client parses it and displays the message:

```typescript
// lib/errors/client.ts
import type { ErrorResponse } from './types'

/**
 * Extract a user-facing message from a fetch error.
 * Works with both Route Handler responses (JSON) and Server Action returns.
 */
export async function parseApiError(response: Response): Promise<ErrorResponse> {
  try {
    const body = await response.json()
    // Validate it's our error shape
    if (body && typeof body.code === 'string') {
      return body as ErrorResponse
    }
  } catch {
    // Response is not JSON (e.g., HTML error page)
  }

  return {
    code: 'SYSTEM_INTERNAL_ERROR',
    message: 'Что-то пошло не так. Попробуйте позже.',
    trace_id: 'unknown',
    status: response.status,
  }
}

/**
 * For Server Actions: unwrap the discriminated union.
 * Returns the error or throws if successful (so it works in catch blocks).
 */
export function getActionError(
  result: { success: false; error: ErrorResponse }
): ErrorResponse {
  return result.error
}
```

### Scenario: Displaying errors to the user

```typescript
// features/likes/hooks/useSendLike.ts
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/errors/client'

export function useSendLike() {
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const res = await fetch('/api/likes/send', {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      })
      if (!res.ok) {
        const err = await parseApiError(res)
        throw err
      }
      return res.json()
    },
    onError: (error: ErrorResponse) => {
      // All error messages from the API are already localized and safe to display.
      // Only errors with `details` need additional per-field rendering.
      if (error.code === 'LIKE_LIMIT_REACHED') {
        // Show modal with subscription CTA, not just toast
        toast.error(error.message, { action: { label: 'Подписка', onClick: () => router.push('/subscription') } })
      } else {
        toast.error(error.message)
      }
    },
  })
}
```

### Display guidelines

1. **Toast (sonner):** Default for most errors. Auto-dismiss after 5 seconds.
2. **Modal with CTA:** For `LIKE_LIMIT_REACHED` — includes "Subscribe" button.
3. **Redirect:** For `AUTH_UNAUTHORIZED`, `AUTH_SUSPENDED` — redirect to `/auth` or `/blocked`.
4. **Inline field errors:** For `VALIDATION_INVALID_INPUT` — iterate `details` map, highlight specific fields.
5. **Silent retry:** For `RATE_LIMIT_*` on background operations (presence tracking, read receipts). Don't show toast; retry with backoff.
6. **Never expose `trace_id` or `status` to the user.** Only `message` and per-field `details`.

---

## Requirement: Logging & Monitoring

### Scenario: An error is handled at the boundary

**Given** the `handleRouteError` or `handleActionError` helper
**When** it processes an error
**Then** it MUST log structured data:

```typescript
// lib/errors/logger.ts
import { AppError } from './app-error'
import { captureSentryException } from '@/lib/sentry'

export function logError(error: AppError) {
  // 1. Structured console log (appears in Vercel Logs)
  console.error(JSON.stringify({
    level: 'error',
    code: error.code,
    status: error.status,
    message: error.message,
    trace_id: error.traceId,
    context: error.logContext ?? {},
    // cause.message is logged, but NOT cause.stack (too verbose for Vercel Logs)
    cause: error.cause?.message ?? null,
  }))

  // 2. Sentry — MANDATORY. See 14-sentry-observability.md.
  //    Uses the centralized captureSentryException helper from lib/sentry/.
  //    Default rule: status >= 500 always reports.
  //    Exception: codes on the MANDATORY_FLOW_REPORT list ALWAYS report regardless
  //    of status (e.g., payment webhook signature mismatch is 4xx but must alert).
  if (shouldReportToSentry(error)) {
    const flow = deriveFlow(error.code)
    void captureSentryException(error.cause ?? error, {
      flow,
      severity: 'error',
      tags: {
        error_code: error.code,
        trace_id: error.traceId,
      },
      extra: {
        traceId: error.traceId,
        logContext: safeLogContext(error.logContext),
      },
    })
  }
}

/**
 * Reports to Sentry when:
 *   - status >= 500 (unexpected system error), OR
 *   - the error's `flow` tag is on the mandatory list per docs/14-sentry-observability.md
 *     ("Mandatory Coverage" section). These must alert even when the HTTP status is 4xx.
 *
 * Pure 4xx business-logic errors (validation, rate-limit hit, RLS denial in a normal
 * flow) do NOT report — they are expected.
 *
 * The `deriveFlow(code)` function uses the code-to-flow mapping defined in
 * lib/sentry/capture.ts — see 14-sentry-observability.md "Typed Flow Taxonomy System"
 * for the full mapping table.
 */
const MANDATORY_FLOW_REPORT = new Set<string>([
  'auth.callback',
  'auth.magic_link_send',
  'payments.init',
  'payments.webhook',
  'payments.rebill',
  'moderation.vision',
  'moderation.action',
  'image.process',
  'image.process.upload_variant',
  'image.process.dlq',
  'ratelimit.infra',
  'cron',
])

function shouldReportToSentry(error: AppError): boolean {
  if (error.status >= 500) return true
  const flow = error.logContext?.flow as string | undefined
  if (!flow) return false
  return [...MANDATORY_FLOW_REPORT].some((m) => flow === m || flow.startsWith(`${m}.`))
}
```

### What gets logged

| Property | Console (Vercel Logs) | Sentry |
|---|---|---|
| `code` | ✅ | ✅ (tag) |
| `status` | ✅ | ✅ |
| `message` | ✅ | ✅ |
| `trace_id` | ✅ | ✅ (tag) |
| `logContext` | ✅ | ✅ (extra) |
| `cause.message` | ✅ | ✅ |
| `cause.stack` | ❌ | ✅ |
| User email / PII | ❌ NEVER | ❌ NEVER |
| Request body | ❌ NEVER (may contain PII) | ❌ NEVER |

### Alert thresholds (Sentry → Slack)

| Condition | Action |
|---|---|
| `SYSTEM_INTERNAL_ERROR` rate > 20/min for 5 min | Alert |
| `SYSTEM_DATABASE_ERROR` > 5 occurrences in 10 min | Alert |
| `EXTERNAL_*_FAILED` > 10 occurrences in 5 min | Alert |
| `PHOTO_PROCESSING_FAILED` > 50 in 1 hour | Alert |
| `PAYMENT_INIT_FAILED` > 5 in 5 min | Alert |

---

## Requirement: Internationalization (RU/EN)

### Scenario: Error message is displayed in the user's language

**Given** an error with code `LIKE_LIMIT_REACHED`
**When** the client renders the error
**Then** the message is in the user's locale.

Error messages come from the **server** in the user's language. The server reads `profiles.locale` or falls back to `Accept-Language` / cookie. Messages are defined in `messages/{locale}.json` under the `errors` namespace:

```json
// messages/ru.json (partial)
{
  "errors": {
    "AUTH_UNAUTHORIZED": "Пожалуйста, войдите в аккаунт",
    "AUTH_FORBIDDEN": "Недостаточно прав",
    "AUTH_SUSPENDED": "Ваш аккаунт заблокирован",
    "AUTH_MAGIC_LINK_EXPIRED": "Ссылка для входа устарела",
    "VALIDATION_INVALID_INPUT": "Проверьте правильность заполнения полей",
    "VALIDATION_FILE_TOO_LARGE": "Файл слишком большой",
    "VALIDATION_FILE_UNSUPPORTED_FORMAT": "Неподдерживаемый формат файла",
    "VALIDATION_IMAGE_TOO_SMALL": "Изображение слишком маленькое",
    "VALIDATION_UNDERAGE": "Вам должно быть не менее 18 лет",
    "LIKE_LIMIT_REACHED": "Вы отправили 3 лайка, исчерпав лимит бесплатного тарифа. Чтобы продолжить пользоваться сервисом без ограничений, приобретите подписку.",
    "LIKE_ALREADY_SENT": "Вы уже поставили лайк этому пользователю",
    "LIKE_OWN_PROFILE": "Нельзя поставить лайк своей анкете",
    "LIKE_BLOCKED": "Действие недоступно",
    "MESSAGE_EDIT_WINDOW_EXPIRED": "Время редактирования сообщения истекло (5 минут)",
    "MESSAGE_NOT_OWNER": "Вы не можете редактировать это сообщение",
    "MESSAGE_ALREADY_DELETED": "Сообщение удалено",
    "PHOTO_MAX_COUNT": "Нельзя загрузить больше 6 фото",
    "PHOTO_ONLY_APPROVED_DELETED": "Нельзя удалить единственное одобренное фото при опубликованной анкете. Сначала добавьте новое фото или скройте анкету.",
    "PROFILE_NOT_PUBLISHED": "Чтобы отправить лайк, сначала опубликуйте анкету",
    "PROFILE_GENDER_IMMUTABLE": "Пол нельзя изменить после регистрации",
    "PROFILE_ONBOARDING_INCOMPLETE": "Завершите регистрацию, чтобы продолжить",
    "PROFILE_NO_APPROVED_PHOTO": "Для публикации необходимо хотя бы одно одобренное фото",
    "BIO_RATE_LIMITED": "Вы можете генерировать описание не более 3 раз в сутки. Попробуйте позже.",
    "BLOCK_ALREADY_EXISTS": "Пользователь уже заблокирован",
    "BLOCK_SELF": "Нельзя заблокировать себя",
    "REPORT_RATE_LIMITED": "Вы можете отправлять не более 5 жалоб в сутки",
    "RATE_LIMIT_TOO_MANY_REQUESTS": "Слишком много запросов. Попробуйте через минуту.",
    "NOT_FOUND": "Не найдено",
    "SYSTEM_INTERNAL_ERROR": "Что-то пошло не так. Попробуйте позже.",
    "SYSTEM_MAINTENANCE": "Сервис на техническом обслуживании. Попробуйте позже."
  }
}
```

```json
// messages/en.json (partial)
{
  "errors": {
    "AUTH_UNAUTHORIZED": "Please sign in to your account",
    "AUTH_FORBIDDEN": "Insufficient permissions",
    "AUTH_SUSPENDED": "Your account has been suspended",
    "AUTH_MAGIC_LINK_EXPIRED": "Login link has expired",
    "VALIDATION_INVALID_INPUT": "Please check your input",
    "VALIDATION_FILE_TOO_LARGE": "File is too large",
    "VALIDATION_FILE_UNSUPPORTED_FORMAT": "Unsupported file format",
    "VALIDATION_IMAGE_TOO_SMALL": "Image is too small",
    "VALIDATION_UNDERAGE": "You must be at least 18 years old",
    "LIKE_LIMIT_REACHED": "You have sent 3 likes, exhausting your free tier. Subscribe to unlock unlimited likes.",
    "LIKE_ALREADY_SENT": "You have already liked this user",
    "LIKE_OWN_PROFILE": "You cannot like your own profile",
    "LIKE_BLOCKED": "Action unavailable",
    "MESSAGE_EDIT_WINDOW_EXPIRED": "Editing window has expired (5 minutes)",
    "MESSAGE_NOT_OWNER": "You cannot edit this message",
    "MESSAGE_ALREADY_DELETED": "Message has been deleted",
    "PHOTO_MAX_COUNT": "Cannot add more than 6 photos",
    "PHOTO_ONLY_APPROVED_DELETED": "Cannot delete the only approved photo while profile is published. Add a new photo first or unpublish.",
    "PROFILE_NOT_PUBLISHED": "Publish your profile first to send a like",
    "PROFILE_GENDER_IMMUTABLE": "Gender cannot be changed after registration",
    "PROFILE_ONBOARDING_INCOMPLETE": "Complete onboarding to continue",
    "PROFILE_NO_APPROVED_PHOTO": "You need at least one approved photo to publish",
    "BIO_RATE_LIMITED": "You can regenerate your description up to 3 times per day. Try again later.",
    "BLOCK_ALREADY_EXISTS": "User is already blocked",
    "BLOCK_SELF": "You cannot block yourself",
    "REPORT_RATE_LIMITED": "You can submit up to 5 reports per day",
    "RATE_LIMIT_TOO_MANY_REQUESTS": "Too many requests. Try again in a minute.",
    "NOT_FOUND": "Not found",
    "SYSTEM_INTERNAL_ERROR": "Something went wrong. Please try again later.",
    "SYSTEM_MAINTENANCE": "Service is under maintenance. Please try again later."
  }
}
```

### How the server resolves messages

```typescript
// lib/errors/messages.ts
import { useLocale } from 'next-intl/server'

export async function getErrorMessage(code: ErrorCode): Promise<string> {
  // next-intl server-side API
  const t = await getTranslations('errors')
  // Falls back: code → ru → en → code itself
  return t(code as any)
}
```

The `AppError` constructor calls `getErrorMessage` only when no explicit `message` override is provided. This keeps the default path clean:

```typescript
// No explicit message → i18n lookup
throw new AppError('LIKE_LIMIT_REACHED')

// Explicit message override → no i18n lookup (rare, e.g. dynamic content)
throw new AppError('LIKE_LIMIT_REACHED', {
  message: t('likes.limit_reached_with_count', { count: 3 }),
})
```

---

## Requirement: Complete Examples

### Example 1 — Validation Error

```typescript
// app/api/auth/callback/route.ts
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')

    // Zod v4 validation
    const parsed = callbackParamsSchema.safeParse({ code })
    if (!parsed.success) {
      throw validationError(parsed.error)
    }

    // ... exchange code for session
  } catch (error) {
    return handleRouteError(error)
  }
}
```

Response (422):
```json
{
  "code": "VALIDATION_INVALID_INPUT",
  "message": "Проверьте правильность заполнения полей",
  "details": {
    "code": "Неверный или просроченный код"
  },
  "trace_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": 422
}
```

### Example 2 — Auth Error

```typescript
// app/api/photos/stream/route.ts
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new AppError('AUTH_UNAUTHORIZED')
    }

    // ... serve photo
  } catch (error) {
    return handleRouteError(error)
  }
}
```

Response (401):
```json
{
  "code": "AUTH_UNAUTHORIZED",
  "message": "Пожалуйста, войдите в аккаунт",
  "trace_id": "b2c3d4e5-f6a7-8901-bcde-fa2345678901",
  "status": 401
}
```

### Example 3 — Business Logic Error (Like Limit)

```typescript
// features/likes/server/send-like.ts
import { AppError } from '@/lib/errors/app-error'

export async function sendLike(fromUserId: string, toUserId: string) {
  // Check tariff limits
  const hasSub = await hasActiveSubscription(fromUserId)
  if (!hasSub) {
    const count = await countLikesUsed(fromUserId)
    if (count >= 3) {
      throw new AppError('LIKE_LIMIT_REACHED', {
        logContext: { userId: fromUserId, likesUsed: count, limit: 3 },
      })
    }
  }

  // Check not blocked
  if (await isBlockedPair(fromUserId, toUserId)) {
    throw new AppError('LIKE_BLOCKED')
  }

  // Insert like — DB constraint handles duplicates, gender, self-like
  const { error } = await supabase.from('likes').insert({
    from_user_id: fromUserId,
    to_user_id: toUserId,
  })

  if (error) {
    // Postgres unique violation → like already sent
    if (error.code === '23505') {
      throw new AppError('LIKE_ALREADY_SENT')
    }
    throw error
  }
}
```

Response (409):
```json
{
  "code": "LIKE_LIMIT_REACHED",
  "message": "Вы отправили 3 лайка, исчерпав лимит бесплатного тарифа. Чтобы продолжить пользоваться сервисом без ограничений, приобретите подписку.",
  "trace_id": "c3d4e5f6-a7b8-9012-cdef-ab3456789012",
  "status": 409
}
```

### Example 4 — System Error

```typescript
// lib/image-processing/pipeline.ts
export async function processImage(buffer: Buffer): Promise<ProcessedVariants> {
  try {
    const image = sharp(buffer).rotate()
    // ... generate variants
    return variants
  } catch (error) {
    // sharp failed — corrupted file, OOM, etc.
    throw new AppError('PHOTO_PROCESSING_FAILED', {
      cause: error instanceof Error ? error : undefined,
      logContext: { bufferSize: buffer.length },
    })
  }
}
```

Response (500):
```json
{
  "code": "PHOTO_PROCESSING_FAILED",
  "message": "Что-то пошло не так. Попробуйте позже.",
  "trace_id": "d4e5f6a7-b8c9-0123-defa-bc4567890123",
  "status": 500
}
```

Note: `PHOTO_PROCESSING_FAILED` has status 500, so Sentry is alerted. The client sees only the generic message. The `logContext` and `cause.stack` are in Sentry for debugging.

---

## Requirement: Extending the System

### Scenario: A new error code is needed

**Given** a new feature adds a new failure condition
**When** an error code is needed
**Then** follow this checklist:

1. **Add the code** to every locale file:
   ```json
   // messages/ru.json → "errors"
   "CHAT_INITIATION_LIMIT": "Вы можете начать не более 10 новых чатов в сутки"

   // messages/en.json → "errors"
   "CHAT_INITIATION_LIMIT": "You can start up to 10 new chats per day"
   ```

2. **Map the status** in the registry:
   ```typescript
   // lib/errors/registry.ts
   export const STATUS_MAP: Record<ErrorCode, number> = {
     // ... existing entries
     CHAT_INITIATION_LIMIT: 429,
   }
   ```

3. **Throw it** where the condition is checked:
   ```typescript
   throw new AppError('CHAT_INITIATION_LIMIT', {
     logContext: { userId, chatsToday: count },
   })
   ```

4. **Handle it on the frontend** if it needs special UI (modal, redirect, specific action):
   ```typescript
   if (error.code === 'CHAT_INITIATION_LIMIT') {
     toast.error(error.message)
   }
   ```

5. **If it's 5xx**, Sentry auto-alerts. No additional config needed.

### Rules for new codes

- The prefix MUST be an existing DOMAIN or a new one approved by the team lead.
- REASON must describe what happened, not what to do. `LIKE_LIMIT_REACHED`, not `BUY_SUBSCRIPTION`.
- Status 4xx = expected. Status 5xx = unexpected (Sentry alert).
- Every code MUST have entries in `messages/ru.json` and `messages/en.json`. CI enforces this (test iterates registry and checks both locale files).
- Never retire codes. If a code is no longer thrown, mark it as `@deprecated` in the registry but keep the i18n entry.

---

## Requirement: CI Enforcement

### Scenario: PR validation catches error system violations

**Given** a PR changes error-related files
**When** CI runs
**Then** these checks MUST pass:

```typescript
// tests/unit/lib/errors/registry.test.ts
import { describe, it, expect } from 'vitest'
import { STATUS_MAP } from '@/lib/errors/registry'
import ruMessages from '@/messages/ru.json'
import enMessages from '@/messages/en.json'

describe('error code registry', () => {
  it('should have a translation for every code in both locales', () => {
    for (const code of Object.keys(STATUS_MAP)) {
      expect(ruMessages.errors).toHaveProperty(code,
        `Missing RU translation for error code: ${code}`)
      expect(enMessages.errors).toHaveProperty(code,
        `Missing EN translation for error code: ${code}`)
    }
  })

  it('should not have orphaned translations without a registry entry', () => {
    for (const key of Object.keys(ruMessages.errors)) {
      expect(STATUS_MAP).toHaveProperty(key,
        `RU translation exists but no registry entry for: ${key}`)
    }
  })

  it('should have valid HTTP status for every code', () => {
    const validStatuses = [401, 403, 404, 409, 422, 429, 500, 502, 503, 504]
    for (const [code, status] of Object.entries(STATUS_MAP)) {
      expect(validStatuses).toContain(status,
        `Invalid HTTP status ${status} for code: ${code}`)
    }
  })
})
```

---

## File Summary

```
lib/errors/
├── types.ts          # ErrorResponse, ErrorCode type
├── registry.ts       # STATUS_MAP (code → HTTP status), full code list
├── app-error.ts      # AppError class
├── handler.ts        # handleRouteError() for Route Handlers
├── action.ts         # handleActionError() for Server Actions
├── client.ts         # parseApiError(), getActionError() for frontend
├── validation.ts     # validationError() Zod → AppError helper
├── logger.ts         # logError() — console + Sentry
└── messages.ts       # getErrorMessage() — i18n resolver
```

---

## Cross-References

- [00 — Overview & Architecture Principles](./00-overview.md) — architecture, security, observability
- [01 — Authentication & Onboarding](./01-auth.md) — auth errors, session management
- [02 — Database Schema & RLS](./02-database.md) — DB error codes (23505 unique violation, etc.)
- [03 — Profiles, Feed & Matching](./03-profiles-feed.md) — like limits, block errors
- [04 — Chat, Realtime & Notifications](./04-chat-realtime.md) — message edit/delete errors
- [05 — Payments (T-Bank)](./05-payments.md) — payment errors
- [06 — Image Processing & Storage](./06-image-processing.md) — photo errors
- [07 — Infrastructure, Testing & i18n](./07-infrastructure.md) — i18n, monitoring, testing
- [08 — Reports, Moderation & Suspensions](./08-moderation.md) — moderation errors
