# Sentry Integration — Phase 1 Design Spec

**Date:** 2026-05-11  
**Status:** Approved — ready for implementation planning  
**Author:** Claude Code (Sonnet 4.6)  
**Related doc:** `docs/14-sentry-observability.md` (canonical requirements)

---

## 1. Objective

Establish a production-grade, maintainable Sentry observability foundation for the Nikah Help platform. This phase covers:

- Full SDK infrastructure (three config files, `withSentryConfig`, `instrumentation.ts`)
- Centralized `lib/sentry/` module with typed helpers, PII scrubbing, and monitoring abstractions
- Source map upload and release tracking wired to Vercel deployments
- Mandatory coverage of the highest-priority business-critical flows
- A clean extension point for Phase 2 rollout to remaining call sites

This spec is scoped to **Phase 1** of the phased rollout described in `docs/14-sentry-observability.md`. It does not cover the service worker, Supabase Edge Functions (none exist yet), or exhaustive per-catch-block instrumentation of profile/feed/likes feature actions (those already flow through `handleActionError → logError → Sentry` and will gain `flow` tags automatically via the code-to-flow derivation added in this phase).

---

## 2. Architecture

### 2.1 New files

```
nikah-help/
├── sentry.client.config.ts                      # Browser SDK init
├── sentry.server.config.ts                      # Node runtime SDK init
├── sentry.edge.config.ts                        # Edge runtime SDK init (minimal)
├── lib/sentry/
│   ├── index.ts                                 # Public API — re-exports all helpers
│   ├── types.ts                                 # FlowTag, SentrySeverity, SentryExtra, CaptureOptions
│   ├── capture.ts                               # captureSentryException, captureMessage
│   ├── scrub.ts                                 # scrubPii — shared beforeSend/beforeSendTransaction
│   ├── monitor.ts                               # withSentryMonitor for cron jobs
│   └── user.ts                                  # setSentryUser — id-only, typed
└── docs/
    └── sentry-integration.md                    # Developer guide
```

### 2.2 Modified files

```
nikah-help/
├── instrumentation.ts                           # Use config files; re-export onRequestError
├── next.config.ts                               # withSentryConfig; CSP update; tunnel exclusion
├── lib/env.ts                                   # NEXT_PUBLIC_SENTRY_DSN + NEXT_PUBLIC_SENTRY_ENV
├── lib/errors/logger.ts                         # Use captureSentryException; code-to-flow mapping
├── proxy.ts                                     # getClaims error + outer catch → Sentry
├── app/api/auth/callback/route.ts               # Sentry on exchange failure + block rebind failure
├── features/auth/server/send-magic-link.ts      # Sentry on ratelimit infra + OTP throw
├── features/chat/hooks/useChatChannel.ts        # CHANNEL_ERROR, TIMED_OUT, reconnect storm
├── features/chat/hooks/usePresence.ts           # CHANNEL_ERROR + TIMED_OUT
├── features/likes/hooks/useMatchListener.ts     # CHANNEL_ERROR + TIMED_OUT
├── lib/ratelimit/with-rate-limit.ts             # Limiter unavailable → Sentry
├── lib/inngest/functions/photo-moderate.ts      # Step failure capture + onFailure handler
├── lib/inngest/functions/notification-dispatch.ts # Push/email failure + onFailure handler
├── app/api/cron/expire-suspensions/route.ts     # withSentryMonitor
├── app/api/cron/subscription-renewal/route.ts  # withSentryMonitor
└── app/api/cron/inactive-account-warn/route.ts # withSentryMonitor
```

**Total: 9 new files, 16 modified files.**

### 2.3 Layering principle

Three patterns cover all Sentry usage in the codebase:

| Pattern                           | Helper                                  | When to use                                    |
| --------------------------------- | --------------------------------------- | ---------------------------------------------- |
| Exception at a boundary           | `captureSentryException(err, opts)`     | Every `catch` that must not be silent          |
| Cron job heartbeat                | `withSentryMonitor(slug, fn, schedule)` | All Vercel Cron routes                         |
| User identity for session context | `setSentryUser(id)`                     | Authenticated Server Components/route handlers |

`logError` in `lib/errors/logger.ts` calls `captureSentryException` internally — every `AppError` with `status >= 500` already flows through it. The update adds `flow` tag derivation so no route files need touching for upload/process/DB error tracking.

---

## 3. `lib/sentry/` Module

### 3.1 `types.ts`

```ts
// Flow taxonomy — exhaustive union, extend here for new flows.
// Suffix conventions:
//   action.<snake_case_action_name>  e.g. action.send_message
//   cron.<vercel-cron-slug>          e.g. cron.expire-suspensions
export type FlowTag =
  | 'auth.magic_link_send'
  | 'auth.callback'
  | 'auth.session_refresh'
  | 'auth.rbac'
  | 'realtime.channel'
  | 'payments.init'
  | 'payments.webhook'
  | 'payments.rebill'
  | 'moderation.vision'
  | 'moderation.action'
  | 'image.upload'
  | 'image.process'
  | 'image.process.upload_variant'
  | 'image.process.dlq'
  | 'db.query'
  | 'db.rls'
  | 'ratelimit.infra'
  | 'ratelimit.abuse'
  | 'edge.proxy'
  | 'notif.send'
  | 'sw'
  | `action.${string}`
  | `cron.${string}`

// Production ingestion paths only; debug is stripped at beforeSend.
export type SentrySeverity = 'fatal' | 'error' | 'warning' | 'info'

// Typed extra — named safe fields prevent accidental PII in metadata.
// Add fields here when a new context type is needed.
export interface SentryExtra {
  traceId?: string
  logContext?: Record<string, string | number | boolean | null>
  step?: string
  attempt?: number
  provider?: string
  channel?: string
  subscriptionId?: string
  photoId?: string
  variant?: string
  cronSlug?: string
  reconnectCount?: number
}

export interface CaptureOptions {
  flow: FlowTag
  severity?: SentrySeverity // default: 'error'
  tags?: Record<string, string>
  extra?: SentryExtra
}
```

### 3.2 `capture.ts`

`captureSentryException(err, opts)`:

- Checks `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` is set; silently no-ops if absent (dev without config)
- Calls `Sentry.captureException(err, { level, tags: { flow, ...tags }, extra })`
- Uses dynamic import of `@sentry/nextjs` so edge/client bundles only pull it in when called
- `flow` tag is always set — no event lands in Sentry without a flow attribution

**Code-to-flow mapping** (used by `logError` to derive `flow` from `AppError.code` automatically):

```
PHOTO_UPLOAD_FAILED / PHOTO_DOWNLOAD_FAILED / EXTERNAL_SUPABASE_STORAGE_FAILED → image.upload
PHOTO_PROCESSING_FAILED / PHOTO_MODERATION_FAILED                               → image.process
SYSTEM_DATABASE_ERROR                                                            → db.query
EXTERNAL_OPENAI_FAILED / EXTERNAL_DEEPSEEK_FAILED / EXTERNAL_OPENAI_TIMEOUT    → moderation.vision
EXTERNAL_TBANK_FAILED                                                            → payments.init
EXTERNAL_RESEND_FAILED                                                           → notif.send
AUTH_UNAUTHORIZED (5xx context only)                                             → auth.callback
PAYMENT_INIT_FAILED / PAYMENT_SIGNATURE_INVALID                                 → payments.webhook
RATE_LIMIT_AUTH_CALLBACK                                                         → ratelimit.infra
SYSTEM_INTERNAL_ERROR / SYSTEM_TIMEOUT (fallthrough)                            → (no flow — error_code tag only)
```

Codes not in the map emit without a `flow` tag so they still land in Sentry — they just won't match flow-based alert rules until Phase 2 annotates them.

### 3.3 `scrub.ts`

`scrubPii(event)` — used as `beforeSend` and `beforeSendTransaction` in all three configs.

Operations (in order):

1. **Header scrubbing** — removes `cookie`, `authorization`, `x-api-key`, and any header whose lowercased name contains `token`, `secret`, `key`. Retains `x-user-id`, `x-user-role`, `content-type`, `x-forwarded-for` (truncated to first IP only).
2. **Query string scrubbing** — strips params: `code`, `token`, `access_token`, `refresh_token`, `apikey`. Strips full value of any param matching the pattern `.*token.*` or `.*secret.*`. Strips signed Supabase Storage URLs (URL contains `?token=` or `X-Amz-Signature`).
3. **Request body field scrubbing** — removes: `email`, `password`, `phone`, `chat_message`, `message_text`, `photo_url`, `token`. Applies one level deep on `event.request?.data` only.
4. **User context stripping** — if `event.user` is present, replaces it with `{ id: event.user.id }`. Removes `email`, `username`, `name`, `ip_address`.
5. **Debug event gating** — if `event.level === 'debug'` and `NEXT_PUBLIC_SENTRY_ENV === 'production'`, returns `null` (event dropped).

### 3.4 `monitor.ts`

`withSentryMonitor(slug, handler, schedule)`:

- Wraps a Vercel Cron handler with `Sentry.withMonitor(slug, handler, { schedule: { type: 'crontab', value: schedule } })`
- The slug convention is `cron.<route-name>` e.g. `cron.expire-suspensions`
- On success: Sentry receives a check-in heartbeat (job ran on time)
- On missed run: Sentry fires a `flow=cron.*` alert per the design doc
- Returns a `NextResponse`-compatible function for use in route exports

### 3.5 `user.ts`

`setSentryUser(id: string)` — calls `Sentry.setUser({ id })`. TypeScript signature only accepts `id: string`, preventing any other field from being passed at the call site.

---

## 4. SDK Config Files

### 4.1 `sentry.server.config.ts`

```
dsn:              process.env.SENTRY_DSN
environment:      process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV
release:          process.env.SENTRY_RELEASE
sendDefaultPii:   false
beforeSend:       scrubPii
beforeSendTransaction: scrubPii
tracesSampler:    (ctx) => {
                    const name = ctx.transactionContext?.name ?? ''
                    if (name.includes('/api/auth/callback')) return 1.0
                    if (name.includes('/api/photos/')) return 1.0
                    return env === 'production' ? 0.1 : 1.0
                  }
tracePropagationTargets: [/^https:\/\/.*\.supabase\.co/, /^https?:\/\/localhost/]
integrations:     default server integrations only
```

### 4.2 `sentry.client.config.ts`

```
dsn:                        process.env.NEXT_PUBLIC_SENTRY_DSN
environment:                process.env.NEXT_PUBLIC_SENTRY_ENV
release:                    process.env.NEXT_PUBLIC_SENTRY_RELEASE
sendDefaultPii:             false
beforeSend:                 scrubPii
tracesSampleRate:           env === 'production' ? 0.05 : 1.0
replaysSessionSampleRate:   env === 'production' ? 0.01 : (env === 'staging' ? 0.1 : 0)
replaysOnErrorSampleRate:   env === 'development' ? 0 : 1.0
integrations:               [
                              replayIntegration({
                                maskAllText: true,
                                maskAllInputs: true,
                                blockAllMedia: true,
                                networkDetailAllowUrls: [],  // no request body capture
                              })
                            ]
denyUrls:                   [
                              /extensions\//i,
                              /^chrome:\/\//i,
                              /^chrome-extension:\/\//i,
                              /^moz-extension:\/\//i,
                              /googletagmanager\.com/i,
                              /mc\.yandex\.ru/i,
                              /yandex\.ru\/i/i,
                            ]
```

Replay integration uses `lazyLoad: true` (Replay bundle excluded from initial page JS — initialises only when session is sampled).

### 4.3 `sentry.edge.config.ts`

```
dsn:            process.env.SENTRY_DSN
environment:    process.env.NEXT_PUBLIC_SENTRY_ENV
release:        process.env.SENTRY_RELEASE
sendDefaultPii: false
beforeSend:     scrubPii
tracesSampleRate: env === 'production' ? 0.02 : 1.0
```

No Replay. No Node-only integrations. Minimal footprint.

### 4.4 `instrumentation.ts` (updated)

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Official Next.js hook — auto-captures unhandled errors in route handlers,
// Server Actions, and middleware with full request context and breadcrumbs.
// Replaces the manual implementation that was missing SDK-injected metadata.
export { onRequestError } from '@sentry/nextjs'
```

---

## 5. `next.config.ts` Changes

### 5.1 `withSentryConfig` wrapper

```ts
import { withSentryConfig } from '@sentry/nextjs'

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: false, // MVP — smaller builds, revisit in Phase 2
  hideSourceMaps: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',
  reactComponentAnnotation: { enabled: true },
})
```

### 5.2 CSP update

Add `https://o*.ingest.sentry.io` to `connect-src` (already present — verify it remains after config changes). The tunnel `/monitoring` is same-origin so no CSP change is needed for browser → tunnel traffic.

### 5.3 Proxy matcher exclusion

Add `/monitoring` to the proxy matcher negative lookahead so the Sentry tunnel bypasses auth, session refresh, and rate limiting:

```ts
// proxy.ts config.matcher — add monitoring|
'/((?!api/|monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)'
```

---

## 6. Environment Variables

### New resolvers in `lib/env.ts`

| Variable                 | Scope                  | Purpose                                        |
| ------------------------ | ---------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN` | public                 | Browser client init (distinct from server DSN) |
| `NEXT_PUBLIC_SENTRY_ENV` | public                 | `production` / `staging` / `development`       |
| `SENTRY_RELEASE`         | server (auto-injected) | `nikah-help@<sha>` — set by Vercel integration |

`SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` already have resolvers; `NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_ENV` are new.

### `.env.example` additions

```
# Sentry — required in production, optional in development
# NEXT_PUBLIC_SENTRY_DSN=https://xxx@oN.ingest.sentry.io/yyy
# SENTRY_DSN=https://xxx@oN.ingest.sentry.io/yyy
# NEXT_PUBLIC_SENTRY_ENV=development
# SENTRY_AUTH_TOKEN=          # build-time only — source map upload
# SENTRY_ORG=                 # Sentry org slug
# SENTRY_PROJECT=             # Sentry project slug
```

---

## 7. `lib/errors/logger.ts` Update

`logError` is updated to:

1. Use `captureSentryException(error.cause ?? error, { flow: deriveFlow(error.code), severity: 'error', extra: { traceId: error.traceId, logContext: safeLogContext(error.logContext) } })` instead of the ad-hoc lazy import
2. `deriveFlow(code)` performs the code-to-flow mapping from §3.2
3. `safeLogContext` strips any string value that matches known PII patterns (email-like, UUID-like auth tokens) before placing it in `extra`
4. 5xx gate is preserved — 4xx errors do not go to Sentry

---

## 8. Critical Flow Coverage

### 8.1 Auth

**`app/api/auth/callback/route.ts`**

- `exchangeCodeForSession` error → `captureSentryException(error, { flow: 'auth.callback', severity: 'error', tags: { step: 'exchange' } })`
- `block_rebind_failed` → `captureSentryException(rebindErr, { flow: 'auth.callback', severity: 'warning', tags: { step: 'block_rebind' } })`

**`features/auth/server/send-magic-link.ts`**

- Ratelimit unavailable (catch in `getAuthRatelimit`) → `captureSentryException(err, { flow: 'auth.magic_link_send', severity: 'error', tags: { step: 'ratelimit_init' } })`
- Ratelimit call failed (catch in `authRatelimit.limit`) → same, `tags: { step: 'ratelimit_call' }`
- OTP threw (`supabase.auth.signInWithOtp` catch) → same, `tags: { step: 'otp_send' }`
- BAN01 warn — remains as breadcrumb-level log, not an exception

**`proxy.ts`** (edge runtime)

- `getClaims()` returns `error` → `captureSentryException(error, { flow: 'auth.session_refresh', severity: 'warning' })` before redirecting. Uses dynamic `import('@sentry/nextjs')` guarded on `SENTRY_DSN` being set.
- Outer `catch` → `captureSentryException(e, { flow: 'edge.proxy', severity: 'error' })`

### 8.2 Realtime

**`features/chat/hooks/useChatChannel.ts`**

- `useChatChannel` subscribe callback: `CHANNEL_ERROR` → `captureSentryException` at `warning`; `TIMED_OUT` → same. Reconnect counter via `useRef<{count: number; windowStart: number}>` — if ≥3 reconnects within 60 s, severity escalates to `error`.
- `useChatUpdates` subscribe callback: same pattern, `CHANNEL_ERROR` and `TIMED_OUT`.

**`features/chat/hooks/usePresence.ts`**

- `CHANNEL_ERROR` and `TIMED_OUT` → `captureSentryException` at `warning` with `flow: 'realtime.channel'`, `tags: { channel: \`chat:${chatId}:presence\` }`

**`features/likes/hooks/useMatchListener.ts`**

- `CHANNEL_ERROR` and `TIMED_OUT` → `captureSentryException` at `warning` with `flow: 'realtime.channel'`, `tags: { channel: \`user:${userId}\` }`

All three hooks: replace `console.warn` with Sentry capture. Retain the retry logic — Sentry capture does not suppress the reconnect.

### 8.3 Rate limiting

**`lib/ratelimit/with-rate-limit.ts`**

- Outer catch (limiter unavailable, failing open) → replace `console.warn` with `captureSentryException(error, { flow: 'ratelimit.infra', severity: 'error' })`

### 8.4 Inngest / background jobs

**`lib/inngest/functions/photo-moderate.ts`**

- `moderate` step: wrap OpenAI call in explicit try/catch → `captureSentryException(err, { flow: 'moderation.vision', severity: 'error', extra: { provider: 'openai', photoId, step: 'moderate' } })` then rethrow
- `update-status` step: wrap DB update → `captureSentryException(err, { flow: 'moderation.action', severity: 'error', extra: { photoId, step: 'update-status' } })` then rethrow
- `onFailure` handler: `captureSentryException` with `severity: 'error'`, `flow: 'moderation.vision'`, `extra: { attempt: event.data.attempt, photoId }`

**`lib/inngest/functions/notification-dispatch.ts`**

- `send-web-push` step: replace `console.error` (non-410/404 case) with `captureSentryException(err, { flow: 'notif.send', severity: 'warning', extra: { channel: 'push', subscriptionId: sub.id } })`
- `send-email` step: replace `console.error` with `captureSentryException(emailErr, { flow: 'notif.send', severity: 'error', extra: { channel: 'email' } })`
- `onFailure` handler: `captureSentryException` with `severity: 'error'`, `flow: 'notif.send'`, `extra: { attempt: event.data.attempt }`

### 8.5 Cron jobs

All three routes export their `GET` handler wrapped with `withSentryMonitor`:

```ts
// expire-suspensions
export const GET = withSentryMonitor(
  'cron.expire-suspensions',
  async (request) => {
    /* existing logic */
  },
  '0 2 * * *',
)
```

The existing `handleRouteError` calls inside each cron handler are preserved — errors that propagate out of the inner handler are already captured by `onRequestError`; `withSentryMonitor` adds the missed-run heartbeat on top.

---

## 9. Upload/Storage Pipeline Coverage (via `logError`)

No route files need changes. The code-to-flow mapping in `logError` (§7) automatically attributes:

| `AppError.code`                                      | Sentry `flow` tag   |
| ---------------------------------------------------- | ------------------- |
| `PHOTO_UPLOAD_FAILED`                                | `image.upload`      |
| `PHOTO_DOWNLOAD_FAILED`                              | `image.upload`      |
| `EXTERNAL_SUPABASE_STORAGE_FAILED`                   | `image.upload`      |
| `PHOTO_PROCESSING_FAILED`                            | `image.process`     |
| `PHOTO_MODERATION_FAILED`                            | `image.process`     |
| `SYSTEM_DATABASE_ERROR`                              | `db.query`          |
| `EXTERNAL_OPENAI_FAILED` / `EXTERNAL_OPENAI_TIMEOUT` | `moderation.vision` |
| `EXTERNAL_TBANK_FAILED`                              | `payments.init`     |
| `EXTERNAL_RESEND_FAILED`                             | `notif.send`        |

---

## 10. PII Protection

### Four-layer defense

| Layer                                                   | Enforced at           |
| ------------------------------------------------------- | --------------------- |
| `sendDefaultPii: false`                                 | All three SDK configs |
| `scrubPii` via `beforeSend`/`beforeSendTransaction`     | All three SDK configs |
| Replay: `maskAllText`, `maskAllInputs`, `blockAllMedia` | Client config only    |
| `setSentryUser` id-only TypeScript contract             | `lib/sentry/user.ts`  |

### `scrubPii` operations (§3.3)

1. Strip sensitive headers: `cookie`, `authorization`, `x-api-key`, headers matching `*token*`, `*secret*`, `*key*`
2. Strip query params: `code`, `token`, `access_token`, `refresh_token`, `apikey`, signed Storage URL params
3. Strip body fields one level deep: `email`, `password`, `phone`, `chat_message`, `message_text`, `photo_url`, `token`
4. Strip user context to `{ id }` only
5. Drop `debug` level events in production

### `SentryExtra` typed contract (§3.1)

No `Record<string, unknown>` escape hatch. All extra metadata fields are named and typed. Call sites cannot accidentally place PII in `extra` via an untyped bag.

---

## 11. Environment Separation

| `NEXT_PUBLIC_SENTRY_ENV` | Server traces                 | Client traces | Edge traces | Replay session | Replay on-error |
| ------------------------ | ----------------------------- | ------------- | ----------- | -------------- | --------------- |
| `production`             | 0.10 (1.0 for critical paths) | 0.05          | 0.02        | 0.01           | 1.0             |
| `staging`                | 1.0                           | 1.0           | 1.0         | 0.10           | 1.0             |
| `development`            | 1.0                           | 1.0           | 1.0         | 0              | 0               |

Same Sentry project, distinct `environment` tags. Alerts scoped to `environment:production`. No DSN in `.env.local.example` — engineers opt in by setting it explicitly.

---

## 12. Source Maps & Release Tracking

- `withSentryConfig` in `next.config.ts` handles source map upload at build time via `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- `hideSourceMaps: true` — maps not served publicly
- `silent: !process.env.CI` — verbose in CI, quiet locally
- `widenClientFileUpload: false` for MVP
- Release name: `nikah-help@${VERCEL_GIT_COMMIT_SHA}` — injected by Vercel ↔ Sentry integration
- `setCommits: { auto: true }` enables "first seen in commit X" links
- Build fails on production if source map upload fails (CI exits non-zero)

---

## 13. Tunnel Route

`/monitoring` (set via `tunnelRoute`) proxies browser Sentry events through our own domain, bypassing ad-blockers. The proxy matcher in `proxy.ts` excludes `/monitoring` from auth, session refresh, and rate limiting. The tunnel is handled entirely by the Next.js SDK's built-in tunnel implementation — no custom route handler needed.

---

## 14. What is Out of Scope (Phase 2)

| Item                                                                        | Reason deferred                                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `lib/inngest/functions/photo-delete.ts`, `chat-delete.ts`, `like-revoke.ts` | DB failures surface via Inngest retry; low blast radius                                    |
| All feature `actions.ts` beyond auth                                        | Already flow through `handleActionError → logError → Sentry` chain                         |
| `public/sw.js` service worker                                               | Plain JS, no bundler — requires dedicated tooling decision                                 |
| Supabase Edge Functions                                                     | No functions exist yet                                                                     |
| Payment webhook route                                                       | Payment module not yet implemented                                                         |
| Breadcrumb API                                                              | `SentryExtra.channel` and `step` fields are the foundation; full breadcrumb API is Phase 3 |
| Sentry ownership rules / alert routing                                      | Operational configuration, not code                                                        |

---

## 15. Developer Guide (outline for `docs/sentry-integration.md`)

The developer guide covers:

1. Required environment variables and where to get them
2. Local development — setting `NEXT_PUBLIC_SENTRY_ENV=development` to enable tracing without polluting production
3. How to use `captureSentryException` at a new call site
4. How to add a new `FlowTag` (extend the union, document the suffix convention)
5. How to wrap a new cron job with `withSentryMonitor`
6. How to verify source maps after a deploy
7. Troubleshooting: tunnel 404, DSN missing, source maps not appearing
8. Debugging workflow (matches `docs/14-sentry-observability.md §Debugging workflow`)

---

## 16. Post-Implementation Verification

After implementation and before merging to production:

1. **TypeCheck + lint pass** — `pnpm typecheck && pnpm lint`
2. **Unit test** — `scrubPii` is unit-tested against fixtures for every PII shape (email, token, signed URL, full user object)
3. **Build** — `pnpm build` succeeds with `withSentryConfig` wrapping; source maps are generated
4. **Tunnel** — verify `/monitoring` returns 200 in the browser network tab
5. **Frontend error** — throw a deliberate `Error('sentry-test-client')` in a dev branch; verify it appears in Sentry with source-mapped stack
6. **Server error** — call `captureSentryException(new Error('sentry-test-server'), { flow: 'db.query' })` from a route handler in dev; verify it appears
7. **Edge error** — verify `proxy.ts` Sentry capture works in a local edge runtime test
8. **Release** — confirm a release with source maps appears in Sentry after a staging deploy
9. **Cron** — verify monitor check-ins appear in Sentry Crons after a cron run

---

## 17. Risks & Mitigations

| Risk                                                                         | Mitigation                                                                                                                                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scrubPii` has a performance regression in edge runtime                      | Edge config receives the same function; it's synchronous O(1) field deletion — no iteration over large structures                                                 |
| Sentry DSN absent in a branch deploy — silent failures                       | `captureSentryException` no-ops cleanly when DSN is absent; `onRequestError` also guards                                                                          |
| `withSentryConfig` wrapping breaks existing `next.config.ts` options         | All existing options (`serverExternalPackages`, `images`, `headers`) pass through to `nextConfig` unchanged                                                       |
| Reconnect storm counter creates stale `useRef` state across channel teardown | Counter is colocated with the channel `useEffect` — cleaned up on `removeChannel` via the effect's return function                                                |
| `onFailure` Inngest handler fires after retries and creates double-reporting | Individual step captures use `severity: 'warning'`; `onFailure` uses `severity: 'error'`. No deduplication needed — two different signals with different severity |
