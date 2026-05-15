# 14 — Sentry: Centralized Error Monitoring & Observability (MANDATORY)

## Purpose

This file is the **single source of truth** for error monitoring, performance tracing, release health, and runtime observability across the Nikah Help platform. **Sentry is mandatory.** A production deployment that does not satisfy the requirements in this document MUST NOT be promoted to `production`.

This document supersedes any conflicting Sentry-related guidance elsewhere in the documentation. Where this document and another file disagree, this file wins, and the other file MUST be updated to match.

**Audience:** AI development agents (Claude Code), backend engineers, frontend engineers, SREs, on-call.

---

## Requirement: Why Sentry, and Why Mandatory

### Scenario: A production incident occurs without a centralized error tracker

**Given** a multi-runtime app spanning Next.js (Node), Edge runtime, Server Actions, Inngest jobs, Supabase Edge Functions, and a browser SPA
**When** an unhandled exception or 5xx happens in any runtime
**Then** the team MUST be able to:

- see the full exception with stack trace, breadcrumbs, request context, release version, and environment within seconds,
- group identical issues across all runtimes and tag them with the failing user flow,
- correlate the failure to a deployment, a release, and a session replay,
- alert the right owner via Slack/Email automatically,
- close the loop with a regression test and a "first seen in commit" link.

This is impossible with `console.error` + Vercel Logs alone. Vercel Logs are time-bounded, ungrouped, unsearchable across runtimes, do not correlate frontend and backend, do not retain release/source-map context, and do not surface user impact (sessions affected, replay video, browser/device). Sentry is the only component in the approved stack that provides cross-runtime error grouping, release health, and replay-correlated debugging.

### Problems Sentry solves on this platform

| Problem                                | Without Sentry                      | With Sentry                                   |
| -------------------------------------- | ----------------------------------- | --------------------------------------------- |
| Frontend errors invisible              | User reports "it broke" via support | Stack trace + replay within minutes           |
| Server Action 500s buried in logs      | Engineers grep Vercel Logs          | Grouped, deduplicated, alertable              |
| Edge runtime errors lost on cold-start | No record after function exits      | Captured before flush, sourcemapped           |
| Realtime/WebSocket disconnect storms   | Users complain; no signal           | Breadcrumb-tracked, alerting on rate          |
| Payment webhook failures silent        | Money lost, support tickets         | High-severity alert, audit trail              |
| Image processing pipeline regressions  | Photos stuck "Processing…"          | Inngest function failures grouped by step     |
| Bad release deployed                   | Only roll back when users notice    | Release Health flags it; auto-rollback option |
| Stack traces minified in prod          | Untriageable                        | Source maps uploaded → readable traces        |
| Cross-runtime user journey debugging   | Five logs to correlate              | Single distributed trace                      |

### Why Sentry is non-negotiable for production readiness

1. The platform processes payments (T-Bank). Silent payment failures are a business-critical risk.
2. The platform processes user-uploaded images via an async pipeline (Inngest + sharp + moderation). Without grouped error reporting, regressions in the pipeline are invisible until users complain.
3. The platform uses Magic Link auth. Auth failures are silent to the user by design (we never confirm whether an email exists). Operators MUST be able to see auth-callback failures even when the user cannot.
4. The platform uses Realtime (Supabase) for chat. WebSocket failures degrade UX silently. They MUST be tracked.
5. The platform runs across at least four execution environments (Node Route Handlers, Edge runtime middleware/proxy, Inngest functions, browser). A unified error sink is required to avoid blind spots.
6. The platform handles sensitive personal data. PII MUST be sanitized before reporting, which requires a controlled, configurable error pipeline — not ad-hoc `console.error`.

---

## Requirement: Approved SDKs & Integration Points

The platform MUST use **only the official Sentry SDKs**. No third-party shims, no homegrown wrappers around `fetch('https://sentry.io/api/...')`.

| Runtime / Surface                     | Required SDK                                 | Init file                                                                                    |
| ------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Next.js (Node, Edge, Browser)         | `@sentry/nextjs`                             | `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`                |
| `instrumentation.ts` register hook    | `@sentry/nextjs`                             | `instrumentation.ts` calls `Sentry.init` for Node + Edge runtimes per Next.js 16 conventions |
| Inngest background jobs (Node)        | `@sentry/nextjs` server build (same process) | reuses `sentry.server.config.ts`                                                             |
| Supabase Edge Functions (Deno)        | `@sentry/deno`                               | `supabase/functions/<fn>/_shared/sentry.ts`                                                  |
| Vercel Cron Jobs                      | `@sentry/nextjs` server                      | reuses `sentry.server.config.ts`, wrapped with `Sentry.withMonitor`                          |
| Service Worker (Web Push)             | `@sentry/browser` (lightweight init)         | `public/sw.js`                                                                               |
| `proxy.ts` (Next 16 proxy/middleware) | `@sentry/nextjs` edge                        | reuses `sentry.edge.config.ts`                                                               |

`@sentry/nextjs` MUST be wired via `withSentryConfig` in `next.config.ts`, which is responsible for:

- injecting Sentry instrumentation,
- uploading source maps at build time,
- hiding source maps from the public bundle (`hideSourceMaps: true`),
- finalizing the release with `setCommits` so commit-level "first seen" works,
- tunneling browser events through `/monitoring` to bypass ad-blockers.

```ts
// next.config.ts
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig = {
  /* ... */
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',
  reactComponentAnnotation: { enabled: true },
})
```

### Stack-specific integration

- **Next.js Route Handlers (`runtime = 'nodejs'`)** — auto-instrumented; no manual `try/catch` for tracing. Errors thrown out of the handler are captured by `instrumentation-client.ts` / `Sentry.captureRequestError` from `instrumentation.ts`.
- **Server Actions** — auto-instrumented through the Next.js SDK. Manual `Sentry.captureException` MUST still be used inside `try/catch` blocks that swallow errors for UX reasons (see "No silent failures").
- **Edge runtime** — `sentry.edge.config.ts` MUST keep `tracesSampleRate` low (≤ 0.05) and MUST NOT load Replay or any non-edge-compatible integration. Do not import Node-only modules.
- **Vercel** — Sentry's official Vercel integration MUST be installed at the project level so deploys auto-create releases, push commit SHAs, and inject `SENTRY_*` env vars into preview/production. Source maps are uploaded by `@sentry/cli` during `next build`.
- **Supabase** — DB query failures bubble up through the JS client and are captured at the boundary; Edge Functions ship `@sentry/deno` and call `Sentry.captureException` before returning a 5xx; Database Webhook delivery failures are surfaced via Inngest function failures (which themselves report).
- **Realtime** — channel error and disconnect events MUST be reported (see "WebSocket / Realtime" below).
- **Image processing pipeline** — every Inngest step MUST be wrapped so the failing `step.run` is captured with the photo id, variant, and step name as tags (no raw image bytes).
- **Payments** — every T-Bank API call and webhook handler MUST report on failure, with the `provider_payment_id` (NOT card data) as a tag.
- **Background jobs / Cron** — wrap with `Sentry.withMonitor('cron-name', ...)` for cron monitoring (heartbeat + missed-run alerts).

---

## Requirement: Layered `lib/sentry/` Architecture

### Centralized Module Design

All Sentry usage in application code MUST go through the centralized `lib/sentry/` module. Direct imports of `@sentry/nextjs` outside of SDK config files (`sentry.*.config.ts`, `instrumentation.ts`) and the `lib/sentry/` module itself are FORBIDDEN.

The module provides a single, typed, auditable surface area for all error capture, PII scrubbing, user context, and cron monitoring. This layered design ensures:

- **Consistency** — every event has a `flow` tag, structured metadata, and PII scrubbing applied uniformly.
- **Auditability** — a grep for `captureSentryException` finds every manual capture site in the codebase.
- **Safe by default** — the TypeScript types prevent PII from being passed in `extra` or `tags`; `setSentryUser` accepts only `id`.
- **Testability** — `scrubPii` is a pure function, unit-testable against fixtures.
- **Replaceability** — if the Sentry SDK API changes, only `lib/sentry/` needs updating, not every call site.

### Module structure

```
lib/sentry/
├── index.ts          # Public API — re-exports all helpers (the ONLY import allowed
│                     #   in application code)
├── types.ts          # FlowTag, SentrySeverity, SentryExtra, CaptureOptions
├── capture.ts        # captureSentryException, captureMessage, CODE_TO_FLOW mapping
├── scrub.ts          # scrubPii — shared beforeSend / beforeSendTransaction
├── monitor.ts        # withSentryMonitor for Vercel Cron jobs
└── user.ts           # setSentryUser — id-only, typed contract
```

### Boundaries and call sites

The `lib/sentry/` module is used at three kinds of boundaries:

1. **Framework error boundaries** — `handleRouteError` and `handleActionError` call `logError`, which internally calls `captureSentryException`. No per-route changes needed for the common path.
2. **Intentional catch blocks** — any `catch` that swallows an error for UX reasons MUST call `captureSentryException` so the error is not silent. This includes auth, payments, moderation, image processing, and Realtime channel errors.
3. **Cron job wrappers** — Vercel Cron Route Handlers export wrapped with `withSentryMonitor`.

All call sites pass through `scrubPii` (via `beforeSend` in each SDK config) and the `lib/sentry/` helper types before reaching the Sentry transport — defense in depth.

---

## Requirement: Standardized Helper Patterns

Three typed helpers form the complete public API of `lib/sentry/`. Every call site MUST use one of these — never `Sentry.captureException` directly.

### `captureSentryException(error, options)`

The primary helper for reporting exceptions at any boundary.

```ts
// lib/sentry/capture.ts
import type { FlowTag, SentrySeverity, SentryExtra } from './types'

interface CaptureOptions {
  flow: FlowTag // REQUIRED — flow taxonomy tag
  severity?: SentrySeverity // default: 'error'
  tags?: Record<string, string> // optional string-only key/value tags
  extra?: SentryExtra // typed extra — no PII possible via type system
}

export async function captureSentryException(error: unknown, options: CaptureOptions): Promise<void>
```

**Behavior:**

- Guards on `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` being set; silently no-ops if absent (dev without config).
- Dynamically imports `@sentry/nextjs` so edge/client bundles only pull it in when called.
- Sets `flow` tag on every event — no event lands in Sentry without flow attribution.
- Maps `severity` to Sentry's `level` field: `fatal` → `fatal`, `error` → `error`, `warning` → `warning`, `info` → `info`.
- Strips `debug` severity events in production via `beforeSend`.

**Usage example (server):**

```ts
import { captureSentryException } from '@/lib/sentry'

try {
  await tbankApi.initPayment(params)
} catch (err) {
  void captureSentryException(err, {
    flow: 'payments.init',
    severity: 'error',
    tags: { provider_payment_id: orderId },
    extra: { provider: 'tbank' },
  })
  throw new AppError('PAYMENT_INIT_FAILED', { cause: err })
}
```

**Usage example (client):**

```ts
'use client'
import { captureSentryException } from '@/lib/sentry'
// Same API — works identically in browser code.
```

### `withSentryMonitor(slug, handler, schedule)`

Wraps a Vercel Cron Route Handler with Sentry Crons monitoring.

```ts
// lib/sentry/monitor.ts
import type { NextRequest } from 'next/server'

export function withSentryMonitor(
  slug: string, // cron.<name>, e.g. 'cron.expire-suspensions'
  handler: (request: NextRequest) => Promise<NextResponse>,
  schedule: string, // crontab string, e.g. '0 2 * * *'
): (request: NextRequest) => Promise<NextResponse>
```

**Behavior:**

- Wraps the handler with `Sentry.withMonitor(slug, handler, { schedule: { type: 'crontab', value: schedule } })`.
- On success: Sentry receives a check-in heartbeat (job ran on time).
- On missed run: Sentry fires a `flow=cron.*` alert per the alerting rules.
- On handler error: the error propagates out; `handleRouteError` captures it with `flow=cron.${slug}`.

**Usage:**

```ts
// app/api/cron/expire-suspensions/route.ts
import { withSentryMonitor } from '@/lib/sentry'

async function handler(request: NextRequest): Promise<NextResponse> {
  // ... existing logic (auth check, query, Inngest emit)
}

export const GET = withSentryMonitor('cron.expire-suspensions', handler, '*/15 * * * *')
```

The schedule string MUST match the corresponding entry in `vercel.json` crons.

### `setSentryUser(userId)`

Sets the user context for the current scope. TypeScript signature accepts only `id: string` — no other field can be passed.

```ts
// lib/sentry/user.ts
export function setSentryUser(id: string): void {
  Sentry.setUser({ id })
}
```

**Rules:**

- MUST be called after successful authentication (Magic Link callback, session refresh).
- MUST be called with the UUID `user.id` only — NEVER `email`, `username`, or any other identifier.
- MUST be cleared on sign-out via `Sentry.setUser(null)` (called in the sign-out action).
- The `scrubPii` `beforeSend` hook additionally strips all user fields except `id` as a safety net — even if a call site violates this rule, PII does not reach Sentry.

**Usage:**

```ts
// After successful auth
import { setSentryUser } from '@/lib/sentry'

setSentryUser(user.id)
```

---

## Requirement: Mandatory Observability Principles

These principles are non-negotiable and enforced through code review, lint rules, and CI checks.

### 1. No silent failures in critical paths

A `catch` block that swallows an error without producing a Sentry event is a defect. There are exactly two acceptable forms:

```ts
// Form A — report and rethrow (or convert to AppError)
try {
  await doThing()
} catch (cause) {
  captureSentryException(cause, { flow: 'thing.do' })
  throw new AppError({ code: 'SYSTEM_INTERNAL_ERROR', cause })
}

// Form B — intentionally suppressed with documented reasoning
try {
  await fireAndForgetTelemetry()
} catch {
  // Intentionally suppressed: telemetry must never block the user-facing path.
  // Risk: a failure here is invisible. Acceptable because the call is non-critical
  // and is itself instrumented elsewhere (see notif worker).
}
```

Form B requires a **non-trivial comment** that names the risk and the compensating control. An empty `catch {}` or `catch (e) { /* nothing */ }` without an explanatory comment MUST fail review.

### 2. All critical exceptions flow through centralized helpers

Every exception that reaches Sentry MUST pass through one of:

- `captureSentryException` (manual capture at boundaries)
- `logError` (automatic capture for `AppError` instances at framework boundaries)
- `onRequestError` (automatic capture for unhandled errors in Route Handlers and Server Actions)

Direct calls to `Sentry.captureException` outside `lib/sentry/` are FORBIDDEN.

### 3. No ad-hoc `Sentry.captureException` outside approved abstractions

```ts
// ❌ FORBIDDEN — bypasses flow taxonomy, PII scrubbing type-safety, and audit trail
import * as Sentry from '@sentry/nextjs'
Sentry.captureException(err, { tags: { flow: 'something' } })

// ✅ REQUIRED — typed, auditable, PII-safe
import { captureSentryException } from '@/lib/sentry'
void captureSentryException(err, { flow: 'auth.callback' })
```

### 4. Structured error reporting only

All errors crossing a boundary (route handler return, Server Action return, Inngest step return) MUST be `AppError` instances with `code`, `status`, `traceId`, `logContext.flow`, and `cause`. Sentry receives the `cause` (raw error with stack) plus `code`/`flow`/`traceId` as **tags** so issues group by failure mode, not by message string.

### 5. Consistent flow taxonomy usage

Every Sentry event MUST carry a `flow` tag from the `FlowTag` union. No event lands in Sentry without flow attribution. The `flow` tag is the primary dimension for alert routing, ownership assignment, and dashboard filtering.

### 6. Severity normalization

All events MUST use the standardized severity levels defined in this document. Do not invent ad-hoc levels. The `captureSentryException` helper enforces the `SentrySeverity` type at compile time.

### 7. Production-safe monitoring defaults

- `console.log` is forbidden in production code paths. Use the structured logger.
- The structured logger writes one JSON line to stdout (Vercel Logs) **and** calls `Sentry.captureException` for `status >= 500`.
- Business-logic errors (4xx) MUST NOT be reported as exceptions, unless the `flow` is on the mandatory coverage list.
- Debug breadcrumbs are allowed but MUST NOT contain PII.
- Debug-severity events (`level === 'debug'`) are dropped in production by `beforeSend`.

---

## Requirement: Typed Flow Taxonomy System

### Purpose

The `FlowTag` union type in `lib/sentry/types.ts` is the **single source of truth** for all flow identifiers in the system. Every Sentry event carries a `flow` tag from this union. The taxonomy enables:

- **Alert routing** — alert rules match on `flow` prefixes (e.g., `flow=payments.*` pages the payments squad).
- **Ownership assignment** — Sentry Ownership Rules auto-assign issues by `flow` prefix to the correct squad.
- **Dashboard filtering** — dashboards are organized by `flow` domain.
- **Cost attribution** — quota consumption is tracked by `flow` domain for capacity planning.

### `FlowTag` union

```ts
// lib/sentry/types.ts

/**
 * Flow taxonomy — exhaustive union of all error/event flows in the system.
 *
 * Suffix conventions:
 *   <domain>.<operation>              General pattern
 *   action.<snake_case_action_name>   Server Action flows
 *   cron.<vercel-cron-slug>           Vercel Cron job flows
 *
 * Extension strategy:
 *   - Add new literals to this union when instrumenting a new flow.
 *   - New top-level domains require a corresponding Sentry Ownership Rule.
 *   - Template literal slots (`action.${string}`, `cron.${string}`) cover
 *     dynamically-generated flows without bloating the union.
 */
export type FlowTag =
  // -- Auth --
  | 'auth.magic_link_send'
  | 'auth.callback'
  | 'auth.session_refresh'
  | 'auth.rbac'

  // -- Realtime --
  | 'realtime.channel'

  // -- Payments --
  | 'payments.init'
  | 'payments.webhook'
  | 'payments.rebill'

  // -- Moderation --
  | 'moderation.vision'
  | 'moderation.action'

  // -- Image pipeline --
  | 'image.upload'
  | 'image.process'
  | 'image.process.upload_variant'
  | 'image.process.dlq'

  // -- Database --
  | 'db.query'
  | 'db.rls'

  // -- Rate limiting --
  | 'ratelimit.infra'
  | 'ratelimit.abuse'

  // -- Edge / proxy --
  | 'edge.proxy'

  // -- Notifications --
  | 'notif.send'

  // -- Service Worker --
  | 'sw'

  // -- Dynamic slots (template literals) --
  | `action.${string}` // e.g. 'action.send_message', 'action.upload_photo'
  | `cron.${string}` // e.g. 'cron.expire-suspensions', 'cron.subscription-renewal'
```

### Naming standards

| Rule                                | Example                        | Rationale                                            |
| ----------------------------------- | ------------------------------ | ---------------------------------------------------- |
| Lowercase, dot-separated tokens     | `auth.callback`                | Consistent with Sentry tag conventions               |
| Domain prefix first                 | `payments.init`                | Enables prefix-based alert routing                   |
| Operation in `snake_case`           | `magic_link_send`              | Readable; matches `AppError.code` convention         |
| Three levels max (domain.sub.op)    | `image.process.upload_variant` | Keeps tags grep-friendly; deeper nesting uses `tags` |
| Dynamic slots use template literals | `action.${string}`             | Extensible without union explosion                   |

### Suffix conventions

| Suffix pattern         | Meaning                       | Example                   |
| ---------------------- | ----------------------------- | ------------------------- |
| `.<verb>`              | An action or operation        | `payments.init`           |
| `.<noun>_<verb>`       | Sub-operation within a domain | `auth.session_refresh`    |
| `action.<action_name>` | Server Action flow (dynamic)  | `action.send_like`        |
| `cron.<job_name>`      | Vercel Cron job (dynamic)     | `cron.expire-suspensions` |

### Extension strategy

**Phase 1 (current):** Concrete literal tags for all business-critical flows. Template slots for Server Actions (`action.*`) and Cron jobs (`cron.*`) so new actions and cron jobs are covered automatically.

**Phase 2:** Add concrete literals for remaining flows as they are instrumented (profile actions, feed queries, like operations, block operations). Until then, these flow through `handleActionError → logError → Sentry` with `error_code` tags but no `flow` tag — they land in Sentry but won't match flow-specific alert rules.

**Phase 3:** Add breadcrumb-level flows for non-critical user journeys (settings changes, theme toggles, language switches). These are `info`-severity and do not generate alerts.

### Code-to-flow mapping

`logError` in `lib/errors/logger.ts` automatically derives `flow` from `AppError.code` for common error paths, so most route files need no changes:

| `AppError.code`                                                                    | Derived `flow` tag                |
| ---------------------------------------------------------------------------------- | --------------------------------- |
| `PHOTO_UPLOAD_FAILED`, `PHOTO_DOWNLOAD_FAILED`, `EXTERNAL_SUPABASE_STORAGE_FAILED` | `image.upload`                    |
| `PHOTO_PROCESSING_FAILED`, `PHOTO_MODERATION_FAILED`                               | `image.process`                   |
| `SYSTEM_DATABASE_ERROR`                                                            | `db.query`                        |
| `EXTERNAL_OPENAI_FAILED`, `EXTERNAL_DEEPSEEK_FAILED`, `EXTERNAL_OPENAI_TIMEOUT`    | `moderation.vision`               |
| `EXTERNAL_TBANK_FAILED`                                                            | `payments.init`                   |
| `EXTERNAL_RESEND_FAILED`                                                           | `notif.send`                      |
| `PAYMENT_INIT_FAILED`, `PAYMENT_SIGNATURE_INVALID`                                 | `payments.webhook`                |
| `RATE_LIMIT_AUTH_CALLBACK`                                                         | `ratelimit.infra`                 |
| `SYSTEM_INTERNAL_ERROR`, `SYSTEM_TIMEOUT`                                          | (no flow — `error_code` tag only) |

Codes not in the mapping emit without a `flow` tag so they still land in Sentry — they just won't match flow-based alert rules until Phase 2 annotates them.

### Example flows by domain

**Auth flows:**

```
auth.magic_link_send   — signInWithOtp failure (tag: step=otp_send|ratelimit_init|ratelimit_call)
auth.callback           — exchangeCodeForSession failure (tag: step=exchange)
auth.callback           — block_rebind failure (tag: step=block_rebind, severity: warning)
auth.session_refresh    — proxy.ts getClaims() error (severity: warning)
auth.rbac               — role missing or claim anomaly
```

**Realtime flows:**

```
realtime.channel        — CHANNEL_ERROR, TIMED_OUT on any Supabase channel
                        — tags: { channel: 'chat:<id>' | 'chat:<id>:presence' | 'user:<id>' }
                        — severity: warning normally, error on reconnect storm (≥3 in 60s)
```

**Cron flows:**

```
cron.expire-suspensions    — Vercel Cron: auto-lift expired suspensions
cron.subscription-renewal  — Vercel Cron: find subscriptions due for renewal
cron.inactive-account-warn — Vercel Cron: 90-day inactive warning email
```

**Moderation flows:**

```
moderation.vision       — Sightengine / OpenAI Vision API call failure
                        — extra: { provider: 'sightengine'|'openai', photoId, step }
moderation.action       — moderator action persistence failure
                        — extra: { photoId, step: 'update-status'|'apply_block' }
```

**Image processing flows:**

```
image.upload            — multipart parse / size validation / Storage upload failure
image.process           — sharp transform error (extra: { variant, step })
image.process.upload_variant — variant upload to Storage failed
image.process.dlq       — pipeline stuck, all retries exhausted (severity: fatal)
```

**Payments flows:**

```
payments.init           — T-Bank Init API failure (extra: { provider: 'tbank' })
payments.webhook        — webhook signature invalid (tags: { reason: 'signature' })
payments.webhook        — webhook idempotency conflict (tags: { reason: 'conflict' }, severity: warning)
payments.rebill         — recurring rebill failure (extra: { attempt })
```

**Notifications flows:**

```
notif.send              — push notification send failure (extra: { channel: 'push', subscriptionId })
notif.send              — email send failure (extra: { channel: 'email' })
```

**Edge runtime flows:**

```
edge.proxy              — uncaught exception in proxy.ts outer catch block
```

---

## Requirement: Mandatory Coverage

Every runtime error, every unhandled exception, and every API failure MUST flow into Sentry. The list below is **non-exhaustive** but each item is **mandatory**.

### Scenario: A failure occurs in any of the listed flows

**Given** any of the listed flows
**When** the failure path executes
**Then** a Sentry event MUST be produced with the prescribed tags and fingerprint

| Flow                                                    | Where to capture                      | Required tags                                              | Severity |
| ------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------- | -------- |
| Authentication — magic link send failure                | `app/(public)/auth/actions.ts`        | `flow=auth.magic_link_send`, `email_domain=<hash>`         | error    |
| Authentication — callback exchange failure              | `app/(public)/auth/callback/route.ts` | `flow=auth.callback`, `provider=supabase`                  | error    |
| Authentication — session refresh failure (proxy.ts)     | `proxy.ts`                            | `flow=auth.session_refresh`, `runtime=edge`                | warning  |
| RBAC — role check anomaly (e.g., role missing)          | RBAC helpers                          | `flow=auth.rbac`                                           | error    |
| Realtime — channel `CHANNEL_ERROR` / `TIMED_OUT`        | chat client + presence                | `flow=realtime.channel`, `channel=<name>`                  | warning  |
| Realtime — repeated reconnect (>3 in 60 s per session)  | client                                | same, `severity=error`                                     | error    |
| Payments — `PAYMENT_INIT_FAILED`                        | T-Bank init route                     | `flow=payments.init`, `provider=tbank`                     | error    |
| Payments — webhook signature invalid                    | webhook handler                       | `flow=payments.webhook`, `reason=signature`                | error    |
| Payments — webhook idempotency conflict                 | webhook handler                       | `flow=payments.webhook`, `reason=conflict`                 | warning  |
| Payments — recurring rebill failure                     | rebill cron                           | `flow=payments.rebill`, `attempt=<n>`                      | error    |
| Moderation — Sightengine / OpenAI Vision call failure   | Inngest `moderate-photo`              | `flow=moderation.vision`, `provider=<sightengine\|openai>` | error    |
| Moderation — moderator action persistence failure       | admin action handlers                 | `flow=moderation.action`                                   | error    |
| Image upload — multipart parse / size validation crash  | upload route                          | `flow=image.upload`                                        | error    |
| Image processing — sharp transform error                | Inngest `process-photo` step          | `flow=image.process`, `variant=<name>`, `step=<name>`      | error    |
| Image processing — variant upload to Storage failed     | same                                  | `flow=image.process.upload_variant`                        | error    |
| Image processing — pipeline stuck / DLQ                 | Inngest failure handler               | `flow=image.process.dlq`                                   | fatal    |
| Database — query failure in Route Handler               | error boundary                        | `flow=db.query`, `pg_code=<sqlstate>`                      | error    |
| Database — RLS denial in unexpected place               | error boundary                        | `flow=db.rls`, severity warning                            | warning  |
| Rate limiting — limiter unavailable (Upstash down)      | rate-limit middleware                 | `flow=ratelimit.infra`                                     | error    |
| Rate limiting — abuse threshold exceeded by single user | rate-limit middleware                 | `flow=ratelimit.abuse`, `user_role=<role>`                 | warning  |
| Server Actions — uncaught exception                     | action wrapper                        | `flow=action.<name>`                                       | error    |
| Edge runtime — uncaught exception in proxy.ts           | proxy                                 | `flow=edge.proxy`                                          | error    |
| Cron / Background jobs — function failure               | Inngest / `withMonitor`               | `flow=cron.<name>`, `attempt=<n>`                          | error    |
| Notifications — channel send failure (push/email)       | notif workers                         | `flow=notif.send`, `channel=<push\|email>`                 | error    |
| Web Push — service worker uncaught error                | `sw.js`                               | `flow=sw`                                                  | warning  |

For every entry above, **at least one Sentry event MUST be produced per failure**, capped by intelligent fingerprinting and `beforeSend` sampling so a runaway loop does not bankrupt the quota (see "Sampling & Cost Control").

---

## Requirement: Architectural Standards

### No silent failures

A `catch` block that swallows an error without producing a Sentry event is a defect. There are exactly two acceptable forms:

```ts
// Form A — report and rethrow (or convert to AppError)
try {
  await doThing()
} catch (cause) {
  captureSentryException(cause, { flow: 'thing.do' })
  throw new AppError({ code: 'SYSTEM_INTERNAL_ERROR', cause })
}

// Form B — intentionally suppressed with documented reasoning
try {
  await fireAndForgetTelemetry()
} catch {
  // Intentionally suppressed: telemetry must never block the user-facing path.
  // Risk: a failure here is invisible. Acceptable because the call is non-critical
  // and is itself instrumented elsewhere (see notif worker).
}
```

Form B requires a **non-trivial comment** that names the risk and the compensating control. Lint rule: an empty `catch {}` or `catch (e) { /* nothing */ }` without an explanatory comment SHOULD fail review.

### Structured error objects

All errors crossing a boundary (route handler return, Server Action return, Inngest step return) MUST be `AppError` instances with `code`, `status`, `traceId`, `logContext`, and `cause` (see [09-error-handling.md](09-error-handling.md)). Sentry receives the `cause` (raw error with stack) plus `code`/`traceId` as **tags** so issues group by failure mode, not by message string.

---

## Requirement: Four-Layer PII Protection Strategy

PII protection is enforced through **four independent layers**. No single layer is sufficient alone — each is a defense-in-depth measure that catches what the others miss.

### Layer 1 — `sendDefaultPii: false`

Set in every `Sentry.init` call across all runtime configs (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`). This prevents the SDK from automatically attaching request bodies, headers, cookies, and user IP addresses to events. It is the broadest filter — it blocks entire categories of data — but it is not granular enough to catch PII in custom `extra`, `tags`, or `breadcrumbs`.

### Layer 2 — `scrubPii` hooks (application-level)

The `scrubPii` function is registered as both `beforeSend` and `beforeSendTransaction` in all three SDK configs. It is a pure function, unit-tested against fixtures for every known PII shape. It runs synchronously (O(1) field deletion, no iteration over large structures) and is safe for the Edge runtime.

**Operations (in order):**

1. **Header scrubbing** — removes: `cookie`, `authorization`, `x-api-key`, and any header whose lowercased name contains `token`, `secret`, or `key`. Retains: `x-user-id`, `x-user-role`, `content-type`, `x-forwarded-for` (truncated to first IP only).

2. **Query string scrubbing** — strips params: `code`, `token`, `access_token`, `refresh_token`, `apikey`. Strips the full value of any param matching the pattern `.*token.*` or `.*secret.*`. Strips signed Supabase Storage URLs (URLs containing `?token=` or `X-Amz-Signature`).

3. **Request body field scrubbing** — removes: `email`, `password`, `phone`, `chat_message`, `message_text`, `photo_url`, `token`. Applies one level deep on `event.request?.data` only.

4. **User context stripping** — if `event.user` is present, replaces it with `{ id: event.user.id }` only. Removes: `email`, `username`, `name`, `ip_address`.

5. **Debug event gating** — if `event.level === 'debug'` and `NEXT_PUBLIC_SENTRY_ENV === 'production'`, returns `null` (event dropped entirely).

### Layer 3 — Replay masking defaults

Replay is configured with maximum privacy defaults from initialization:

```
maskAllText: true       — all text content on screen is masked (****)
maskAllInputs: true     — all input fields are masked
blockAllMedia: true     — all images, videos, canvas are blacked out
```

Additionally, the following routes are excluded from replay entirely via `replayIntegration` route blocking:

- `/onboarding` — contains PII during profile creation
- `/profile/edit` — contains editable PII fields
- `/admin/*` — contains other users' data visible to moderators
- `/chat/*` — contains private chat messages

No allowlist exemptions exist for chat or profile editor surfaces. The `lazyLoad: true` option ensures the Replay bundle is only downloaded when a session is actually sampled.

### Layer 4 — `setSentryUser` discipline

The `setSentryUser` helper in `lib/sentry/user.ts` accepts only `id: string` via its TypeScript signature. It is impossible to pass `email`, `username`, or any other field at the call site.

```ts
// ✅ CORRECT — type-checked, id-only
setSentryUser(user.id)

// ❌ TYPE ERROR — second argument not accepted
setSentryUser(user.id, { email: user.email })
```

As a safety net, `scrubPii` in `beforeSend` strips all user fields except `id` even if a future code change bypasses the typed helper.

### Forbidden fields

The following MUST NEVER leave the application process and reach Sentry:

| Category                   | Forbidden data                                                            | Where enforced                                 |
| -------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| **Identity**               | Email addresses (any form), phone numbers, full name                      | `scrubPii` + `setSentryUser` type              |
| **Auth**                   | Auth tokens, session cookies, magic-link tokens, refresh tokens, API keys | `scrubPii` headers + query params              |
| **Payments**               | PAN, CVV, cardholder data, full bank card number                          | `scrubPii` body fields + server discipline     |
| **Chat content**           | Plaintext chat message content, voice message transcripts                 | `scrubPii` body fields + Replay masking        |
| **Photos**                 | Photo bytes, photo URLs containing signed tokens                          | `scrubPii` query params + Replay blockAllMedia |
| **Location**               | Geo coordinates more precise than city-level                              | Server discipline — never in `extra`           |
| **Demographics**           | Date of birth (year is acceptable; full DOB is not)                       | Server discipline — never in `extra`           |
| **Browser fingerprinting** | User agent strings beyond `family/major-version`                          | `beforeSend` — truncate UA to `family/major`   |

### Sanitization rules

1. **Email hashing for tags**: When an email domain is needed for debugging (e.g., `flow=auth.magic_link_send` to detect provider-specific issues), use a SHA-256 hash of the domain only. Never include the full email or the local part.

   ```ts
   // ✅ CORRECT
   tags: {
     email_domain: await sha256(email.split('@')[1])
   }
   // ❌ FORBIDDEN
   tags: {
     email
   }
   tags: {
     email_domain: email.split('@')[1]
   } // plaintext domain
   ```

2. **Payment IDs only**: Tag with `provider_payment_id` (T-Bank `OrderId`). Never include card mask, PAN suffix, or cardholder name.

3. **Photo references**: Tag with `photoId` (UUID). Never include the original filename (may contain user's name), signed URLs, or EXIF data.

4. **Log context**: `logContext` in `AppError` may contain business identifiers (user UUIDs, photo UUIDs, order UUIDs) but MUST NOT contain PII. The `safeLogContext` helper in `lib/sentry/capture.ts` strips any string value matching known PII patterns before placing it in `extra`.

### Replay privacy rules

| Rule                          | Configuration                          | Cannot be overridden |
| ----------------------------- | -------------------------------------- | -------------------- |
| All text masked               | `maskAllText: true`                    | Per-element          |
| All inputs masked             | `maskAllInputs: true`                  | Per-element          |
| All media blocked             | `blockAllMedia: true`                  | Per-element          |
| Sensitive routes excluded     | Route blocklist in `replayIntegration` | Per-route            |
| Network body capture disabled | `networkDetailAllowUrls: []`           | Per-request          |
| Lazy-loaded                   | `lazyLoad: true`                       | Build-time           |

### Compliance expectations

- **GDPR**: No personal data in Sentry. `setSentryUser` uses only the internal UUID — this is pseudonymous data. Combined with `sendDefaultPii: false`, the Sentry project does not process GDPR-covered personal data. The Data Processing Agreement (DPA) with Sentry covers the residual risk of IP addresses in Sentry's ingress logs (Sentry's infrastructure, not our events).
- **Data retention**: Sentry project retention is set to 90 days for error events, 30 days for transactions/replays. This matches our data-minimization obligation.
- **Right to erasure**: Since `setSentryUser` uses only the internal UUID, a GDPR erasure request that deletes the user's `profiles` row also severs the link between Sentry events and the natural person. No additional Sentry-side action is needed.
- **Audit**: The four-layer defense is verified quarterly: (1) sample 50 production events and confirm no PII; (2) run `scrubPii` unit tests against updated PII shape fixtures; (3) review Replay session samples for accidental PII leakage.

---

## Requirement: Replay & Tracing Strategy

### Session Replay

**Sampling configuration (per environment):**

| Environment   | `replaysSessionSampleRate` | `replaysOnErrorSampleRate` | Rationale                                    |
| ------------- | -------------------------- | -------------------------- | -------------------------------------------- |
| `production`  | **0.01** (1%)              | **1.0** (100%)             | Cost control; replay on every error session  |
| `staging`     | **0.10** (10%)             | **1.0** (100%)             | Higher sampling for pre-release verification |
| `development` | **0** (disabled)           | **0** (disabled)           | No replay locally                            |

**Replay behavior:**

- 1% of normal user sessions are recorded.
- When an error occurs in ANY session, that session's replay is captured at 100%.
- The replay shows the 60 seconds before the error and 30 seconds after.
- Replay uses `lazyLoad: true` — the Replay bundle (~35 KB gzipped) is only downloaded when a session is sampled.

### Performance Tracing

**Sampling configuration (per environment and runtime):**

| Runtime                      | Production | Staging | Development |
| ---------------------------- | ---------- | ------- | ----------- |
| Server (Node Route Handlers) | **0.10**   | 1.0     | 1.0         |
| Client (Browser)             | **0.05**   | 1.0     | 1.0         |
| Edge (proxy.ts)              | **0.02**   | 1.0     | 1.0         |

**Critical-path override:** The server `tracesSampler` (function form) always samples the following at 1.0 even in production:

- `/api/auth/callback` — auth is critical; every trace matters
- `/api/payments/*` — payment traces at 1.0 for audit trail
- `/api/photos/*` — photo pipeline traces at 1.0 for debugging regressions

```ts
// sentry.server.config.ts
tracesSampler: (ctx) => {
  const name = ctx.transactionContext?.name ?? ''
  if (name.includes('/api/auth/callback')) return 1.0
  if (name.includes('/api/payments')) return 1.0
  if (name.includes('/api/photos/')) return 1.0
  return env === 'production' ? 0.1 : 1.0
},
```

### Tunnel Route

`tunnelRoute: '/monitoring'` in `withSentryConfig` proxies all browser Sentry events through our own domain. This:

1. **Bypasses ad-blockers** — many ad-blockers block requests to `*.ingest.sentry.io`. Tunneling through `/monitoring` (same origin) avoids this.
2. **Simplifies CSP** — no need to add `https://o*.ingest.sentry.io` to `connect-src` for the tunnel path; same-origin requests are covered by `'self'`. (The direct-ingest domain is still in CSP as a fallback.)
3. **Preserves auth exclusion** — the proxy matcher in `proxy.ts` excludes `/monitoring` from auth checks, session refresh, and rate limiting:
   ```ts
   // proxy.ts config.matcher
   '/((?!monitoring|_next/static|_next/image|favicon.ico).*)'
   ```
4. **No custom handler needed** — the tunnel is handled entirely by the Next.js SDK's built-in tunnel implementation.

### Source Map Protection

- `hideSourceMaps: true` — source maps are uploaded to Sentry at build time but NEVER served to browsers. Requests for `.map` files return 404.
- `widenClientFileUpload: true` — uploads source maps for all client bundles, not just the entry points.
- `SENTRY_AUTH_TOKEN` is a scoped token with only `project:releases` and `project:write` — it cannot read event data.
- The token is a **build-time only** environment variable. It is never exposed at runtime or in client bundles.
- Production builds fail if source map upload fails (`silent: !process.env.CI` — CI exits non-zero on upload error).

### `denyUrls` Filtering

The client config filters out noise from browser extensions and third-party scripts:

```ts
// sentry.client.config.ts
denyUrls: [
  /extensions\//i,                    // Chrome/Edge extensions
  /^chrome:\/\//i,                    // Chrome internal URLs
  /^chrome-extension:\/\//i,          // Chrome extension URLs
  /^moz-extension:\/\//i,             // Firefox extension URLs
  /googletagmanager\.com/i,           // GTM (not our code)
  /mc\.yandex\.ru/i,                  // Yandex Metrica (not our code)
  /yandex\.ru\/i/i,                   // Yandex Metrica (not our code)
],
```

These filters prevent extension-caused errors (`ResizeObserver loop limit exceeded`, content-script injection failures) from consuming the error quota and polluting the issue list.

### Bundle-Size Optimization Strategy

| Technique                                     | Where              | Savings                                                                    |
| --------------------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| `disableLogger: true`                         | `withSentryConfig` | Strips Sentry's internal console logger from client bundle (~2 KB gzipped) |
| `lazyLoad: true` for Replay                   | Client config      | Replay bundle (~35 KB gzipped) only downloaded when session is sampled     |
| Tree-shaking                                  | SDK design         | `@sentry/nextjs` tree-shakes unused integrations by default                |
| No `@sentry/integrations` extras              | Package policy     | Each extra integration adds ~3–10 KB; must be explicitly justified in PR   |
| Edge config — no Replay, no Node integrations | Edge config        | Keeps edge bundle minimal (edge has strict size limits)                    |
| `widenClientFileUpload: true`                 | `withSentryConfig` | One-time build cost; source maps not in runtime bundle                     |

**Bundle budget impact:** The Sentry SDK (without Replay) adds approximately 20–25 KB gzipped to the initial client bundle. With Replay lazy-loaded, the incremental cost for non-sampled sessions is zero beyond the base SDK. This is within the 150 KB budget for `/feed` initial JS.

---

## Requirement: Performance Monitoring, Tracing, Release Health, Replay

### Tracing

- `tracesSampleRate`:
  - Production: **0.10** server, **0.05** client, **0.02** edge.
  - Staging: **1.0**.
  - Development: **1.0** locally, **0** in CI.
- `tracePropagationTargets` MUST include the canonical app domains and the Supabase project URL so distributed traces span backend ↔ database where Supabase RPC tracing is available.
- All Server Actions, Route Handlers, and Inngest functions are auto-traced. Manual `Sentry.startSpan` is required only when wrapping a unit of work that is otherwise opaque (e.g., a single `step.run` in image processing).

### Release tracking

- A release is created on every Vercel deploy by the official Vercel ↔ Sentry integration.
- Release name MUST be `nikah-help@<git-sha>` (Vercel injects `VERCEL_GIT_COMMIT_SHA`).
- Source maps MUST be uploaded for every release (handled by `withSentryConfig`).
- Releases MUST be finalized with `setCommits: { auto: true }` so "first seen in commit X" works.
- **Release Health** (sessions, crash-free users) MUST be enabled. The deploy is gated on crash-free users `>= 99.5%` over the first 30 minutes (see "Deployment Verification").

### Session Replay (selective)

- Production: `replaysSessionSampleRate = 0.01`, `replaysOnErrorSampleRate = 1.0`. We replay 1% of normal sessions and 100% of sessions where an error occurred.
- Staging: `replaysSessionSampleRate = 0.1`, `replaysOnErrorSampleRate = 1.0`.
- Development: replay disabled.
- Replay MUST mask all text, mask all inputs, and block all media. Privacy-sensitive routes (`/onboarding`, `/profile/edit`, `/admin/*`, `/chat/*`) MUST additionally be excluded from session sampling via `Sentry.replayIntegration({ ... })` rules.

### Bundle size discipline

- The browser SDK MUST use tree-shaking. Replay is loaded **lazily** via the lazy-load pattern (`import('@sentry/nextjs').then(...)` inside `replayIntegration({ lazyLoad: true })`) so it only ships when sampled.
- No `@sentry/integrations` extras unless explicitly justified in a PR.
- `disableLogger: true` MUST be set in `withSentryConfig` to strip the SDK's internal logger from the client bundle.

---

## Requirement: Operational Standards

### Severity levels

| Level     | Definition                                                 | Examples                                                    |
| --------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| `fatal`   | Money/data loss in progress, user-blocking system outage   | Stuck DLQ, payment provider returning 5xx > 5 min           |
| `error`   | Unhandled exception or 5xx that affected at least one user | Server Action threw, sharp crashed, webhook handler crashed |
| `warning` | Recoverable failure or anomaly                             | Single Realtime reconnect, single rate-limit infra blip     |
| `info`    | Notable business event                                     | New release deployed, cron run completed                    |
| `debug`   | Diagnostic only — production sample rate 0                 | Per-step image processing trace                             |

### Alerting rules (Sentry → Slack `#alerts-prod`)

| Trigger                                            | Channel                      | Severity             |
| -------------------------------------------------- | ---------------------------- | -------------------- |
| Any new `fatal` issue                              | `#alerts-prod` + PagerDuty   | page on-call         |
| Crash-free users < 99.5% over 30 min               | `#alerts-prod` + PagerDuty   | page on-call         |
| `flow=payments.*` error count > 5 in 5 min         | `#alerts-prod` + `#payments` | page on-call         |
| `flow=image.process.dlq` any occurrence            | `#alerts-prod`               | notify on-call       |
| `flow=auth.callback` error rate > 2% over 10 min   | `#alerts-prod`               | notify on-call       |
| `flow=realtime.channel` error rate > 5% per minute | `#chat`                      | notify channel owner |
| `flow=ratelimit.infra` any occurrence              | `#alerts-prod`               | notify on-call       |
| `flow=cron.*` missed run (Sentry Crons)            | `#alerts-prod`               | notify on-call       |
| `SYSTEM_DATABASE_ERROR` > 5 in 10 min              | `#alerts-prod` + `#database` | page on-call         |
| New issue first seen in last release               | `#release-watch`             | informational        |

### Error ownership

Every Sentry project area has a documented owner. Sentry's "Ownership Rules" MUST be configured so that issues are auto-assigned by `flow` tag.

| `flow` prefix                             | Owner                |
| ----------------------------------------- | -------------------- |
| `auth.*`                                  | Auth squad           |
| `payments.*`                              | Payments squad       |
| `realtime.*`, chat                        | Chat squad           |
| `image.*`, `moderation.*`                 | Trust & Safety squad |
| `ratelimit.*`, `db.*`, `cron.*`, `edge.*` | Platform squad       |
| `notif.*`, `sw`                           | Growth squad         |

Unassigned issues MUST be triaged within one business day. The on-call owns triage by default.

### Debugging workflow

1. Open the issue in Sentry. Read the **stack trace**, **breadcrumbs**, **tags** (`flow`, `error_code`), and **release**.
2. If a session replay exists, watch the last 30 s before the error.
3. Click through to the **distributed trace** — confirm whether the failing span is upstream (Supabase, T-Bank, Sightengine) or in our code.
4. Check **Release Health** for the affected release; if crash-free users dropped, escalate to potential rollback.
5. Reproduce locally using the request payload (PII already scrubbed), or write a regression test. Do not "fix" without a reproduction or a test.
6. Land the fix on a branch. The PR description MUST link the Sentry issue. Resolving the issue in Sentry MUST be done via "Resolve in next release" — never "Resolve" alone, which forfeits regression detection.

### Deployment verification

After every production deploy, the deployer (human or bot) MUST verify:

- The new release appears in Sentry with source maps attached.
- Within 15 minutes: no new `fatal` issues, no `error` count > 3× the previous release's baseline.
- Crash-free users `>= 99.5%` (Release Health).
- No `flow=payments.*` errors in the first 30 minutes.

If any check fails, the on-call MUST decide: continue with a hotfix OR rollback via Vercel "Promote a previous deployment". This is a one-click operation; rollback is the default if in doubt.

### Rollout strategy

The introduction of Sentry as a hard mandate is staged to minimize risk:

#### Phase 0 — Baseline (week 0)

1. Install `@sentry/nextjs`, scaffold `sentry.*.config.ts`, `lib/sentry/`, `instrumentation.ts`.
2. Wire `withSentryConfig` in `next.config.ts`. Deploy to staging.
3. Install Vercel ↔ Sentry integration. Confirm releases + source maps appear.
4. Verify a synthetic error end-to-end (server, client, edge, Inngest, Edge Function).

#### Phase 1 — Capture (weeks 1–2)

4. Wire `logError` to call `captureSentryException` for `status >= 500`.
5. Instrument business-critical flows: auth, payments, moderation, image pipeline, rate-limiter infra, Realtime channels, cron jobs, notification dispatch.
6. Add the `flow` tag at every manual capture site.
7. Audit every `catch` block — convert to Form A or annotate as Form B.

#### Phase 2 — Privacy & sampling (weeks 2–3)

8. Implement `scrubPii` and unit-test it against fixtures of every known PII shape.
9. Tune sample rates and replay masking. Verify no PII appears in any captured event by sampling 50 production events manually.
10. Enable Replay with masking and lazy-load. Verify bundle size delta is ≤ 25 KB gzipped.

#### Phase 3 — Operational maturity (weeks 3–4)

11. Configure ownership rules, alert routes, and Slack/PagerDuty integrations.
12. Run a fire drill: inject a synthetic `fatal` and verify on-call is paged within 5 minutes.
13. Add deploy-verification step (`crash-free users ≥ 99.5%`) to the deploy runbook.

#### Phase 4 — Hard mandate (week 4+)

14. CI checks: build fails if `withSentryConfig` is removed, if `sentry.*.config.ts` files are deleted, or if `Sentry.init` is missing in any required runtime.
15. PR template requires a "Sentry impact" line for any new error path.
16. Quarterly review of: alert noise, unowned issues, sample rates, cost.

### Monitoring ownership expectations

- **On-call engineer**: Triages new Sentry issues within 1 business day. Owns unassigned issues by default. Decides rollback vs. hotfix during deploy verification.
- **Squad lead**: Reviews their squad's `flow` prefix dashboard weekly. Ensures alert noise stays below 1 false positive per day.
- **Platform squad**: Owns Sentry infrastructure (SDK upgrades, `lib/sentry/` module, config files, `withSentryConfig` wrapper, CI checks, quota/cost). Runs quarterly review.
- **All engineers**: Every PR that adds a new error path MUST include a "Sentry impact" line. Every `catch` block MUST follow Form A or Form B. No `console.error` in new production code — use `captureSentryException`.

---

## Requirement: Environment Configuration

### Required Environment Variables

| Variable                            | Scope                                             | Purpose                                                  |
| ----------------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `SENTRY_DSN`                        | server-only                                       | Server, Edge, and Inngest init                           |
| `NEXT_PUBLIC_SENTRY_DSN`            | public                                            | Browser client init (same project, public DSN by design) |
| `SENTRY_AUTH_TOKEN`                 | server-only, **build-time only**                  | Source-map upload by `@sentry/cli`                       |
| `SENTRY_ORG`                        | server-only                                       | Org slug                                                 |
| `SENTRY_PROJECT`                    | server-only                                       | Project slug                                             |
| `NEXT_PUBLIC_SENTRY_ENV`            | public                                            | `production` / `staging` / `development`                 |
| `SENTRY_RELEASE`                    | server-only (auto-injected by Vercel integration) | Release identifier (`nikah-help@<sha>`)                  |
| `NEXT_PUBLIC_SENTRY_RELEASE`        | public (auto-injected)                            | Same value, accessible in browser bundle                 |
| `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | public (Vercel-auto)                              | Commit SHA for release tagging in client bundle          |

### Vercel Integration

The official Vercel ↔ Sentry integration MUST be installed at the project level (Vercel Integrations marketplace). This integration:

1. **Auto-creates releases** on every deploy (production and preview).
2. **Injects environment variables** automatically:
   - `SENTRY_RELEASE` (server) and `NEXT_PUBLIC_SENTRY_RELEASE` (client) — set to `nikah-help@<VERCEL_GIT_COMMIT_SHA>`
   - `NEXT_PUBLIC_SENTRY_ENV` — mapped from `VERCEL_ENV` (`production` / `preview` / `development`)
   - `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` — injected per environment
3. **Links commits** to releases so Sentry can show "first seen in commit X by author Y".
4. **Associates deploys** with Sentry releases for Release Health tracking.

Once the integration is installed, engineers MUST NOT manually set DSNs in Vercel project settings except for emergency hotfix scenarios.

### Source Map Upload Flow

```
git push → Vercel build starts
  → next build runs
    → withSentryConfig injects Sentry webpack plugin
      → @sentry/cli creates release (nikah-help@<sha>)
      → @sentry/cli uploads source maps to Sentry
      → @sentry/cli finalizes release with setCommits
  → Build completes
  → Vercel deploys
```

- `SENTRY_AUTH_TOKEN` MUST be set in Vercel project settings as a **build-time only** environment variable.
- The token MUST be scoped: `project:releases` + `project:write` on this project only.
- Production builds fail if source map upload fails (`silent: !process.env.CI` — CI exits non-zero).
- Preview deploys MAY skip source map upload to save quota; staging deploys MUST upload.
- `hideSourceMaps: true` ensures source maps are never served to browsers; requests for `.map` files return 404.

### Release Tracking

- Release name: `nikah-help@<VERCEL_GIT_COMMIT_SHA>` (injected by Vercel integration).
- Each release is finalized with `setCommits: { auto: true }` so Sentry knows which commits are in each release.
- Release Health tracks: crash-free session rate, crash-free user rate, adoption (sessions), and adoption (users).
- Deploy gate: crash-free users `>= 99.5%` over the first 30 minutes post-deploy.

### Deployment Tagging

Every Sentry event carries:

- `release` — `nikah-help@<git-sha>`
- `environment` — `production` / `staging` / `development`
- `dist` — build ID (auto-generated by Vercel)

These tags enable:

- **"First seen in release X"** — pinpoint which deploy introduced a regression
- **"This issue is new in the latest release"** — automatic alert on new issues
- **Release comparison** — side-by-side error counts between two releases

### CI/CD Integration

```yaml
# .github/workflows/ci.yml (Sentry-related additions)
- name: Build
  run: pnpm build
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
    SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
    # SENTRY_DSN not needed at build time — only SENTRY_AUTH_TOKEN for source map upload
```

- The `SENTRY_AUTH_TOKEN` secret is stored in GitHub Actions secrets and exposed only at build time.
- The build fails if `withSentryConfig` is removed or if source map upload fails on `main` branch.
- A future CI check (Phase 4) will verify that `sentry.*.config.ts` files exist and contain `Sentry.init`.

### Production Deployment Requirements

Before promoting a deployment to production, the following MUST be confirmed:

1. [ ] Vercel ↔ Sentry integration is installed and active
2. [ ] `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are set (injected by integration)
3. [ ] `SENTRY_AUTH_TOKEN` is set (build-time, scoped token)
4. [ ] `SENTRY_ORG` and `SENTRY_PROJECT` are set
5. [ ] `NEXT_PUBLIC_SENTRY_ENV` resolves to `production`
6. [ ] `withSentryConfig` wraps `next.config.ts` export
7. [ ] `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` committed and imported by `instrumentation.ts`
8. [ ] `lib/sentry/` module committed with all helpers
9. [ ] `instrumentation.ts` exports `onRequestError` from `@sentry/nextjs`
10. [ ] Source maps uploaded and verified (check latest release in Sentry)
11. [ ] Three environments (`production`, `staging`, `development`) exist in Sentry project
12. [ ] Alert rules configured and scoped to `environment:production`
13. [ ] Ownership rules configured by `flow` prefix
14. [ ] PII scrubbing verified: `sendDefaultPii: false`, `scrubPii` in `beforeSend`, Replay masked, project-level Data Scrubbing rules set
15. [ ] `denyUrls` filtering active on client config
16. [ ] Tunnel route `/monitoring` functional and excluded from proxy matcher
17. [ ] Bundle size verified: initial JS for `/feed` ≤ 150 KB gzipped (including Sentry base SDK)

---

## Requirement: Environment Separation

Three Sentry environments MUST be configured: `development`, `staging`, `production`. The `environment` field in `Sentry.init` is set from `process.env.NEXT_PUBLIC_SENTRY_ENV` which is wired from Vercel:

| Vercel target       | Sentry `environment` | Sample rates          | Replay              |
| ------------------- | -------------------- | --------------------- | ------------------- |
| Production          | `production`         | traces 0.10/0.05/0.02 | 1% / 100% on-error  |
| Preview (PRs)       | `staging`            | 1.0                   | 10% / 100% on-error |
| Development (local) | `development`        | 1.0                   | 0%                  |

- Each environment uses the **same project** (so issues group across environments) but distinct `environment` tags so filters and alerts can scope to production only.
- Alerts MUST be scoped to `environment:production` unless explicitly cross-environment.
- Local development MUST default `SENTRY_DSN=""` so engineers do not pollute production projects. Setting it explicitly opts in.

---

## Requirement: DSN Management & Environment Variables

### Variables

| Var                          | Scope                                             | Purpose                                                  |
| ---------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `SENTRY_DSN`                 | server-only                                       | Server, Edge, and Inngest init                           |
| `NEXT_PUBLIC_SENTRY_DSN`     | public                                            | Browser client init (same project, public DSN by design) |
| `SENTRY_AUTH_TOKEN`          | server-only, **build-time only**                  | Source-map upload by `@sentry/cli`                       |
| `SENTRY_ORG`                 | server-only                                       | Org slug                                                 |
| `SENTRY_PROJECT`             | server-only                                       | Project slug                                             |
| `NEXT_PUBLIC_SENTRY_ENV`     | public                                            | `production` / `staging` / `development`                 |
| `SENTRY_RELEASE`             | server-only (auto-injected by Vercel integration) | Release identifier (`nikah-help@<sha>`)                  |
| `NEXT_PUBLIC_SENTRY_RELEASE` | public (auto-injected)                            | Same value, accessible in browser bundle                 |
| `SENTRY_TUNNEL_ROUTE`        | implicit                                          | `/monitoring` — set in `withSentryConfig`                |

### Rules

- `SENTRY_AUTH_TOKEN` MUST be a **scoped** token (only `project:releases`, `project:write` on this project). It MUST never be exposed at runtime.
- DSNs MUST be rotated annually and immediately if a leak is suspected.
- The Vercel ↔ Sentry integration owns env injection for preview and production. Engineers MUST NOT set DSNs manually in Vercel except for hotfix scenarios.
- No DSNs in `.env.local.example`. Provide placeholders only.

### CI/CD

- GitHub Actions or the Vercel build pipeline runs `sentry-cli releases new`, `sentry-cli releases set-commits --auto`, `sentry-cli releases finalize`, and source-map upload — all of this is handled by `withSentryConfig` when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are present at build time.
- The build MUST fail if source-map upload fails on a production deploy. (`silent: !process.env.CI` and CI exits non-zero on upload error.)
- Preview deploys MAY skip source-map upload to save quota; staging deploys MUST upload.

---

## Requirement: Sampling & Cost Control

- Use `tracesSampler` (function form) where finer control is needed — e.g., always sample `flow=payments.*` and `flow=auth.callback` at 1.0 even in production.
- Use `beforeSend` to drop known-noise issues (e.g., `ResizeObserver loop limit exceeded`, browser-extension stack frames).
- Configure **per-issue rate limits** on the project so a single runaway loop cannot exhaust the monthly event quota.
- Configure **spike protection** at the project level.
- Replay MUST use the lazy-load pattern; do not include the full Replay bundle on every page.

---

## Requirement: Configuration Reference (canonical)

### `sentry.server.config.ts`

```ts
import * as Sentry from '@sentry/nextjs'
import { scrubPii } from '@/lib/sentry/scrub'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENV,
  release: process.env.SENTRY_RELEASE,
  sendDefaultPii: false,
  tracesSampler: (ctx) => {
    const name = ctx.transactionContext?.name ?? ''
    if (name.includes('/api/auth/callback')) return 1.0
    if (name.includes('/api/payments')) return 1.0
    if (name.includes('/api/photos/')) return 1.0
    return process.env.NEXT_PUBLIC_SENTRY_ENV === 'production' ? 0.1 : 1.0
  },
  tracePropagationTargets: [/^https:\/\/.*\.supabase\.co/, /^https?:\/\/localhost/],
  beforeSend(event) {
    return scrubPii(event)
  },
  beforeSendTransaction(event) {
    return scrubPii(event)
  },
})
```

### `sentry.client.config.ts`

```ts
import * as Sentry from '@sentry/nextjs'
import { scrubPii } from '@/lib/sentry/scrub'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  sendDefaultPii: false,
  tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_ENV === 'production' ? 0.05 : 1.0,
  replaysSessionSampleRate: process.env.NEXT_PUBLIC_SENTRY_ENV === 'production' ? 0.01 : 0.1,
  replaysOnErrorSampleRate: 1.0,
  denyUrls: [
    /extensions\//i,
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /googletagmanager\.com/i,
    /mc\.yandex\.ru/i,
    /yandex\.ru\/i/i,
  ],
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      lazyLoad: true,
      networkDetailAllowUrls: [],
    }),
  ],
  beforeSend: scrubPii,
})
```

### `sentry.edge.config.ts`

```ts
import * as Sentry from '@sentry/nextjs'
import { scrubPii } from '@/lib/sentry/scrub'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENV,
  release: process.env.SENTRY_RELEASE,
  tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_ENV === 'production' ? 0.02 : 1.0,
  sendDefaultPii: false,
  beforeSend: scrubPii,
  // No Replay, no Node-only integrations.
})
```

### `instrumentation.ts`

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export { onRequestError } from '@sentry/nextjs'
```

### Supabase Edge Functions (Deno)

```ts
// supabase/functions/_shared/sentry.ts
import * as Sentry from 'npm:@sentry/deno'
Sentry.init({
  dsn: Deno.env.get('SENTRY_DSN'),
  environment: Deno.env.get('SENTRY_ENV'),
  release: Deno.env.get('SENTRY_RELEASE'),
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
})
export { Sentry }
```

### `withMonitor` for Cron jobs

```ts
import * as Sentry from '@sentry/nextjs'

export const GET = Sentry.withMonitor(
  'cron-cleanup-orphan-photos',
  async () => {
    // ...
  },
  { schedule: { type: 'crontab', value: '0 3 * * *' } },
)
```

---

## Requirement: Implementation Checklist

The following checklist MUST be satisfied before the platform is considered production-ready:

### SDK setup

- [ ] `@sentry/nextjs` installed (latest)
- [ ] `@sentry/deno` available in Edge Functions
- [ ] `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` present and committed
- [ ] `instrumentation.ts` registers Node + Edge configs and exports `onRequestError`
- [ ] `next.config.ts` wraps export with `withSentryConfig`
- [ ] `lib/sentry/` module committed: `index.ts`, `types.ts`, `capture.ts`, `scrub.ts`, `monitor.ts`, `user.ts`

### Source maps & releases

- [ ] `SENTRY_AUTH_TOKEN` configured in Vercel project (build-time only)
- [ ] `widenClientFileUpload: true`, `hideSourceMaps: true`, `disableLogger: true`
- [ ] Vercel ↔ Sentry integration installed at the project level
- [ ] Release name = `nikah-help@<sha>` and `setCommits: { auto: true }` finalize

### Environments

- [ ] `production`, `staging`, `development` environments exist in the Sentry project
- [ ] Sample rates set per environment as specified above
- [ ] Alerts scoped to `environment:production`

### PII / privacy

- [ ] `sendDefaultPii: false` in all configs
- [ ] `beforeSend` and `beforeSendTransaction` use `scrubPii` from `lib/sentry/scrub`
- [ ] Replay masks all text, all inputs, all media
- [ ] Replay disabled on `/onboarding`, `/profile/edit`, `/admin/*`, `/chat/*`
- [ ] `setUser` only sets `id` — enforced by `setSentryUser` type contract
- [ ] Project-level Data Scrubbing + Advanced Data Scrubbing rules configured
- [ ] `denyUrls` filtering active on client config
- [ ] `networkDetailAllowUrls: []` in replay config (no request body capture)

### Coverage

- [ ] Auth callback failures captured
- [ ] Magic-link send failures captured
- [ ] Realtime channel `CHANNEL_ERROR` / `TIMED_OUT` / disconnect-storm captured
- [ ] T-Bank init + webhook + rebill failures captured with `provider_payment_id`
- [ ] Image upload + sharp pipeline + variant upload captured per step
- [ ] Moderation pipeline (Sightengine / Vision) failures captured
- [ ] DB query failures bubbled up and captured at boundary
- [ ] Rate-limiter infra failures captured
- [ ] Server Action wrapper captures uncaught exceptions
- [ ] Edge runtime (`proxy.ts`) captures uncaught exceptions
- [ ] Inngest functions and Vercel Cron jobs wrapped with `Sentry.withMonitor`
- [ ] Notification send failures captured

### Operations

- [ ] Severity rubric documented (here)
- [ ] Alert rules created in Sentry as listed
- [ ] Ownership rules configured by `flow` tag
- [ ] On-call rotation includes Sentry triage SLA (1 business day for unowned issues)
- [ ] Release Health gate (`crash-free users ≥ 99.5%` over 30 min) integrated into deploy verification
- [ ] Rollback runbook references the Sentry release diff

### Cost control

- [ ] Project-level spike protection enabled
- [ ] Per-issue rate limits set
- [ ] Replay uses `lazyLoad: true`
- [ ] `disableLogger: true`, `tunnelRoute: '/monitoring'`

---

## Requirement: Intentionally Deferred Items

The following items are explicitly deferred to future phases. Each deferral names **what** is deferred, **why**, and **what observability guarantees still exist** in the interim.

### Deferred to Phase 2 — Extended flow coverage

| Item                                                                        | Reason deferred                                                                                                                                         | Current guarantee                                                                                                                                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature `actions.ts` beyond auth (profile, feed, likes, blocks, reports)    | Already flow through `handleActionError → logError → Sentry` chain. They land in Sentry with `error_code` and `trace_id` tags but without a `flow` tag. | Errors are captured and searchable by `error_code`; they just won't match flow-based alert rules until `flow` tags are added.                                                                |
| `lib/inngest/functions/photo-delete.ts`, `chat-delete.ts`, `like-revoke.ts` | DB failures surface via Inngest's built-in retry; blast radius is low (single-user operations, not multi-user pipelines).                               | Inngest retry with exponential backoff provides resilience. If all retries fail, the Inngest dashboard shows the failure. Phase 2 wraps step-level operations with `captureSentryException`. |
| Payment webhook route                                                       | Payment module not yet implemented.                                                                                                                     | N/A — will be Sentry-instrumented from day one when payment module is built.                                                                                                                 |
| `public/sw.js` service worker                                               | Plain JS, no bundler — requires dedicated tooling decision (how to inject DSN, how to tree-shake `@sentry/browser` for a service worker context).       | Service worker errors are rare and surfaced via browser DevTools. Phase 2 evaluates `@sentry/browser` lightweight init or a custom `fetch`-based reporter.                                   |

### Deferred to Phase 3 — Operational enhancements

| Item                                               | Reason deferred                                                                                                                                     | Current guarantee                                                                                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Edge Functions                            | No Edge Functions exist yet. The current architecture uses Inngest for background work and Route Handlers for sync work.                            | When Edge Functions are introduced, they will use `@sentry/deno` from day one per this document's requirements.                                                       |
| Breadcrumb API (`addBreadcrumb` for user journeys) | Requires design work: which user actions get breadcrumbs, how to avoid PII in breadcrumb data/message, how to keep breadcrumb volume within limits. | Basic breadcrumbs are auto-generated by the SDK (navigation, clicks, console). `SentryExtra.channel` and `step` fields provide structured context on manual captures. |
| Custom dashboards per squad                        | Requires Sentry Dashboards configuration per squad.                                                                                                 | The `flow` taxonomy and ownership rules provide filtering in the default Sentry issue list per squad.                                                                 |
| End-to-end distributed tracing verification        | Requires all services to be live and instrumented before trace completeness can be measured.                                                        | Distributed tracing is enabled (trace propagation headers, `tracePropagationTargets`); trace completeness will be verified during Phase 3.                            |

### Deferred to Phase 4 — Hard enforcement

| Item                                                 | Reason deferred                                                                                                                                             | Current guarantee                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| CI check that build fails without `withSentryConfig` | Need operational confidence in the Sentry setup first — a CI gate that blocks deploys when Sentry is misconfigured should not be the first line of defense. | Code review enforces Sentry config presence. The checklist in this document is the manual gate. |
| PR template "Sentry impact" line                     | Requires team adoption of Sentry workflow first.                                                                                                            | Code review catches missing Sentry instrumentation.                                             |
| Automated cost/anomaly detection                     | Requires historical data to establish baselines.                                                                                                            | Manual quarterly review of sample rates and cost.                                               |

---

## Requirement: Improvements to Existing Observability Gaps

The audit of the existing documentation found the following gaps. They are addressed by this document and by the cross-references added in each affected file.

| Gap                                                                                                                                                                                                                   | Risk                                                                                            | Resolution                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `09-error-handling.md` reported Sentry only for `status >= 500`, but multiple **expected** failure paths (payment webhook signature mismatch, moderation step failure) are 4xx by HTTP convention — they were silent. | Payment fraud and moderation regressions invisible.                                             | This doc mandates `flow`-based reporting independent of HTTP status for the listed flows. `09-error-handling.md` updated to require `Sentry.captureException` regardless of status when the `flow` is on the mandatory list. |
| `04-chat-realtime.md` did not require capturing `CHANNEL_ERROR` / `TIMED_OUT`.                                                                                                                                        | Chat outages invisible.                                                                         | This doc requires capture; `04-chat-realtime.md` updated.                                                                                                                                                                    |
| `06-image-processing.md` and `13-photo-variants.md` describe the Inngest pipeline but do not require per-step Sentry capture.                                                                                         | A regression in a single sharp step is masked by Inngest's retry behavior.                      | This doc requires per-step capture with `step` tag; both files updated.                                                                                                                                                      |
| `10-rate-limiting.md` had no requirement to alert when the limiter infra (Upstash) is down — failures default to "fail open" which is silent.                                                                         | DDoS surface opens silently.                                                                    | This doc adds `flow=ratelimit.infra` with alerting; `10-rate-limiting.md` updated.                                                                                                                                           |
| `05-payments.md` did not name Sentry as the alert sink for webhook anomalies.                                                                                                                                         | Money loss invisible until reconciliation.                                                      | This doc adds `flow=payments.*` mandatory capture; `05-payments.md` updated.                                                                                                                                                 |
| `08-moderation.md` had no observability requirements.                                                                                                                                                                 | Moderation pipeline degradations invisible.                                                     | This doc adds `flow=moderation.*` mandatory capture; `08-moderation.md` updated.                                                                                                                                             |
| `01-auth.md` did not mandate magic-link failure capture; auth failures are deliberately silent to users.                                                                                                              | Operators have no signal when auth is broken.                                                   | `01-auth.md` updated to require server-side capture even when the user-facing message remains generic.                                                                                                                       |
| No release-health gate on deploys.                                                                                                                                                                                    | Bad releases promoted past detection window.                                                    | This doc adds Release Health gate; `07-infrastructure.md` updated.                                                                                                                                                           |
| No environment separation policy.                                                                                                                                                                                     | Staging noise drowns production alerts.                                                         | This doc defines three environments with distinct sampling.                                                                                                                                                                  |
| No PII contract.                                                                                                                                                                                                      | Compliance and reputational risk.                                                               | This doc defines a four-layer PII defense.                                                                                                                                                                                   |
| No `lib/sentry/` centralized module.                                                                                                                                                                                  | Ad-hoc `Sentry.captureException` scattered across the codebase; no type safety; no audit trail. | This doc mandates `lib/sentry/` as the sole API surface for Sentry in application code.                                                                                                                                      |
| No flow taxonomy.                                                                                                                                                                                                     | Events ungrouped by business domain; no alert routing by flow.                                  | This doc defines the `FlowTag` union as the canonical taxonomy.                                                                                                                                                              |
| No deferred-items documentation.                                                                                                                                                                                      | Unclear what is intentionally unscoped vs. a gap.                                               | This doc includes the "Intentionally Deferred Items" section.                                                                                                                                                                |

---

## Cross-References

- [00-overview.md](00-overview.md) — Tech stack, observability section
- [01-auth.md](01-auth.md) — Magic-link and callback failure capture
- [04-chat-realtime.md](04-chat-realtime.md) — Realtime/WebSocket capture
- [05-payments.md](05-payments.md) — T-Bank failures
- [06-image-processing.md](06-image-processing.md) — Pipeline per-step capture
- [07-infrastructure.md](07-infrastructure.md) — DSN/env vars, source maps, deploy gate
- [08-moderation.md](08-moderation.md) — Moderation pipeline capture
- [09-error-handling.md](09-error-handling.md) — `AppError`, structured logging, Sentry mapping
- [10-rate-limiting.md](10-rate-limiting.md) — Limiter infra failures
- [11-idempotency.md](11-idempotency.md) — Webhook conflict capture
- [12-notifications.md](12-notifications.md) — Channel send failure capture
- [13-photo-variants.md](13-photo-variants.md) — Variant pipeline capture
