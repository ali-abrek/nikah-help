# 00 — Overview & Architecture Principles

## Purpose

This file is the single source of truth for the Nikah Help platform's technology stack, architecture principles, project structure, environment variables, and AI agent development rules. All other documentation files derive their constraints from this document.

**Target audience:** AI development agents (Claude Code) and senior fullstack engineers.

---

## Requirement: Technology Stack

The platform MUST use the following technologies at their latest stable versions as of May 2026. Before installing any package, the agent MUST verify the latest stable version via `npm dist-tag ls <package>`.

### Scenario: Agent installs project dependencies

**Given** a fresh project checkout
**When** the agent runs `pnpm install`
**Then** all packages listed in the version table are installed at their latest stable versions
**And** no deprecated or legacy packages are present

### Version Table

| Layer | Technology | Constraint |
|---|---|---|
| Frontend framework | **Next.js 16** (App Router) | `latest` |
| UI runtime | **React 19** + `react-dom` | `latest` |
| Styling | **Tailwind CSS v4** | `latest` |
| Tailwind PostCSS plugin | `@tailwindcss/postcss` | `latest` |
| Client cache / server state | **TanStack Query v5** | `latest` |
| Local UI state | **Zustand v5** | `latest` |
| Forms | **React Hook Form v7** | `latest` |
| Validation resolver | `@hookform/resolvers` | `latest` |
| Schema validation | **Zod v4** | `latest` |
| Supabase JS client | `@supabase/supabase-js` | `latest` |
| Supabase SSR helper | `@supabase/ssr` | `latest` |
| Backend | **Next.js Route Handlers** (`runtime = 'nodejs'`) | built-in |
| Server actions | **Server Actions** | built-in |
| Database | **Supabase Postgres** (RLS + PostGIS) | cloud |
| Authentication | **Supabase Auth** (Magic Link only) | cloud |
| Realtime | **Supabase Realtime v2** (Changes + Broadcast + Presence) | cloud |
| File storage | **Supabase Storage** (private buckets) | cloud |
| Background jobs | **Inngest** | `latest` |
| DB triggers → jobs | **Supabase Database Webhooks** | cloud |
| Cron | **Vercel Cron Jobs** + `pg_cron` | built-in |
| Image processing | **sharp** | `latest` |
| AI: bio generation | **OpenAI Node.js SDK** | `latest` |
| AI: moderation | **OpenAI Vision (gpt-4o)** or **Sightengine** | API |
| Payments | **T-Bank Internet Acquiring** (iframe + REST API) | — |
| Web Push | `web-push` | `latest` |
| Email | **Resend** | `latest` |
| Rate limiting | **Upstash Redis** + `@upstash/ratelimit` | `latest` |
| CDN / DNS / WAF | **Cloudflare** | — |
| Deployment / CI/CD | **Vercel** (GitHub integration) | — |
| Monitoring | **Sentry** (Next.js SDK) — **MANDATORY**, see [14-sentry-observability.md](14-sentry-observability.md) | `latest` |
| Analytics | **Vercel Analytics** + **PostHog** | `latest` |
| i18n | **next-intl** | `latest` |
| Themes | **next-themes** | `latest` |
| Headless UI | **shadcn/ui** + **Radix UI** | `latest` |
| Icons | **lucide-react** | `latest` |
| Toast notifications | **sonner** | `latest` |
| Audio waveform | **wavesurfer.js** | `latest` |
| E2E tests | **Playwright** (`@playwright/test`) | `latest` |
| Unit/component tests | **Vitest** + `@testing-library/react` | `latest` |
| HTTP mocks in tests | **MSW (Mock Service Worker)** | `latest` |
| Type system | **TypeScript** (strict mode) | `latest` |
| Linter | **ESLint** (`next/core-web-vitals` config) | `latest` |
| Formatter | **Prettier** | `latest` |
| Package manager | **pnpm** | `latest` |
| DB migrations | **Supabase CLI** | `latest` |
| Node.js | LTS (Active) | `22.x` |

> **Decision:** No separate backend server is allowed. All business logic runs in Next.js Route Handlers with `runtime = 'nodejs'`, Server Actions, or Inngest background functions.

### Project Entry Point

```bash
pnpm create next-app@latest nikah-help \
  --typescript \
  --tailwind \
  --app \
  --turbopack \
  --import-alias "@/*"

pnpm add \
  @supabase/supabase-js \
  @supabase/ssr \
  @tanstack/react-query \
  zod \
  zustand \
  react-hook-form \
  @hookform/resolvers \
  next-intl \
  next-themes \
  sonner \
  inngest \
  resend \
  web-push \
  openai \
  wavesurfer.js \
  sharp \
  @upstash/redis \
  @upstash/ratelimit

pnpm add -D \
  vitest \
  @vitest/coverage-v8 \
  @testing-library/react \
  @testing-library/user-event \
  @testing-library/jest-dom \
  msw \
  @playwright/test \
  @types/web-push
```

### Mandatory `tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  }
}
```

---

## Requirement: Architecture Principles

### Synchronous vs Asynchronous Paths

**Scenario: Request is handled within 2 seconds**

**Given** a client request that can complete within 1-2 seconds
**When** the request arrives
**Then** it MUST be handled synchronously via: Client → Route Handler (`runtime = 'nodejs'`) → Supabase Postgres (Supavisor / pgBouncer)

**Scenario: Request requires long-running processing**

**Given** a task that takes longer than 2 seconds (image moderation, data deletion, fan-out notifications)
**When** the task is triggered
**Then** it MUST be delegated to an Inngest function via an event
**And** the client receives an immediate acknowledgement, not a blocking wait

**Scenario: Real-time updates are needed**

**Given** features requiring live updates (chat messages, notifications, typing indicators, online status)
**When** data changes or user presence updates
**Then** Supabase Realtime v2 MUST be used:
- **Postgres Changes** for new messages and notification inserts
- **Broadcast** for ephemeral events (typing indicators, match alerts)
- **Presence** for online/offline status

> **Decision:** Route Handlers MUST NOT execute long-running tasks. Vercel limits Node.js runtime execution (60s on Pro). All tasks exceeding 2 seconds MUST use Inngest.

### Next.js 16 Proxy Convention

In Next.js 16, `middleware.ts` is renamed to `proxy.ts` to clarify its role as a network-level proxy. The agent MUST create `proxy.ts`, not `middleware.ts`.

### Authentication & Sessions

**Scenario: User session is verified on the server**

**Given** a request to a protected Route Handler or Server Action
**When** the server needs to authorize the user
**Then** `getClaims()` or `getUser()` from `@supabase/ssr` MUST be used (they verify against the Supabase Auth server)
**And** `getSession()` MUST NOT be used for authorization decisions (it reads cookies only without verification)

**Scenario: Session cookie is refreshed**

**Given** a user navigating the application
**When** the `proxy.ts` intercepts the request
**Then** it MUST refresh the session via `supabase.auth.getClaims()`

> **Decision:** Supabase Auth is the sole Identity Provider. Only Magic Link authentication is supported. Google OAuth and Apple OAuth are explicitly excluded.

> **Decision:** New Supabase projects (May 2025+) use `sb_publishable_...` (instead of `anon`) and `sb_secret_...` (instead of `service_role`). Both old keys still work during the transition period. This documentation uses the new key names.

### Dual Protection

Every data access MUST be protected at two levels:
1. **Database level:** Row Level Security (RLS) policies in Postgres
2. **Application level:** Zod v4 validation + authorization checks in Route Handlers and Server Actions

### Tailwind CSS v4 Rules

```css
/* globals.css — CORRECT for v4 */
@import "tailwindcss";

@theme {
  --color-primary: #FF8C42;
  --color-primary-hover: #FCAF58;
  --color-accent: #F9C784;
  --font-sans: "Inter", sans-serif;
}

@layer base {
  :root {
    --background: #FFFFFF;
    --foreground: #111111;
  }
  .dark {
    --background: #4E598C;
    --foreground: #F5F5F5;
  }
}
```

```json
// postcss.config.mjs
{
  "plugins": {
    "@tailwindcss/postcss": {}
  }
}
```

**Forbidden for v4:**
- ❌ `@tailwind base; @tailwind components; @tailwind utilities;` (v3 syntax)
- ❌ `tailwind.config.js` / `tailwind.config.ts` (configuration is in CSS)
- ❌ `autoprefixer` in PostCSS (built into v4)
- ❌ `postcss-import` (`@import` is built into v4)

### File Handling

**Scenario: User uploads a photo**

**Given** an authenticated user
**When** they upload a photo
**Then** the client obtains a signed upload URL from the backend
**And** uploads directly to Supabase Storage (backend never proxies file bytes)
**And** after successful upload, a Database Webhook triggers Inngest for async processing

> **Decision:** Supabase Storage buckets are private. Profile photo variants are read exclusively by the `/api/photos/stream` Route Handler using the service role key. Storage URLs never reach the browser. See [06 — Image Processing & Storage](./06-image-processing.md) for the full delivery architecture.

### Ephemeral State

| State | Mechanism |
|---|---|
| Online / offline | **Supabase Presence** (track on channel join) |
| Typing status | **Supabase Realtime Broadcast** (never written to DB) |
| Last seen | Column `last_seen_at` in `profiles`, updated on `presence.leave` |

> **Decision:** Upstash Redis is used ONLY for rate limiting (`@upstash/ratelimit`). It is NOT a state store.

### React Query v5 Rules

```typescript
// CORRECT: v5 object syntax
const { data } = useQuery({
  queryKey: ['profile', userId],
  queryFn: () => fetchProfile(userId),
  staleTime: 5 * 60 * 1000,
})

// CORRECT: mutation with optimistic update
const mutation = useMutation({
  mutationFn: updateProfile,
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['profile'] })
    const snapshot = queryClient.getQueryData(['profile'])
    queryClient.setQueryData(['profile'], newData)
    return { snapshot }
  },
  onError: (_err, _vars, ctx) => {
    queryClient.setQueryData(['profile'], ctx?.snapshot)
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
})

// FORBIDDEN: v3/v4 positional array syntax
// useQuery(['key'], fetchFn) — deprecated in v5
```

### Zod v4 Rules

```typescript
import { z } from 'zod'

// New top-level validators (v4)
const email = z.email()     // instead of z.string().email()
const uuid  = z.uuid()      // instead of z.string().uuid()
const url   = z.url()       // instead of z.string().url()

// Preferred: "error" over "message"
const schema = z.string().min(2, { error: 'Minimum 2 characters' })

// FORBIDDEN: { message: '...' } — deprecated in v4 (still works but discouraged)
```

### Idempotency & Resilience

- All critical mutations MUST be idempotent. Client generates `idempotency_key` (UUID v4). Backend stores in `idempotency_keys` with TTL and caches response.
- Inngest functions: idempotency via `step.run()` with unique step ID. Built-in retry with exponential backoff.
- On external service failure (OpenAI, T-Bank): graceful degradation, retry in Inngest.

### Native App Forward-Compatibility

Although the MVP ships as a Web/PWA, the architecture must keep the door open for a future native iOS / Android client. Concrete rules:

1. **Auth via Supabase JS** — works identically in React Native, Swift, Kotlin. No browser-specific assumptions in `auth.users` / `profiles`.
2. **MVP — Server Actions are the default for writes.** They give us the cleanest UX/RSC integration and faster shipping. The cost is that they are NOT consumable by native clients. We accept this debt knowingly:
   - **MVP rule:** writes MAY use Server Actions. Reads MAY use Server Components / Route Handlers as convenient.
   - **Pre-native release:** every write Server Action MUST be ported to a Route Handler counterpart sharing the same Zod schema and the same business helper. The Server Action becomes a thin wrapper over the helper, and the Route Handler becomes the public API entry point. To keep this port cheap, **today** we MUST: (a) put all business logic in pure helper functions inside `features/<feature>/server/` (NOT inline in the action); (b) define the Zod input schema separately and exported (`features/<feature>/schemas.ts`); (c) avoid Server-Action-only patterns like `useFormState` / `useFormStatus` in any place where the equivalent client-fetch flow would be awkward.
   - This is tracked as **migration debt** and revisited the moment a native app is greenlit. See the "Native readiness debt" entry in the README.
3. **Supabase Realtime works in native** — Postgres Changes + Broadcast + Presence are usable from any Supabase client SDK.
4. **Supabase Storage signed URLs work in native** — no change needed.
5. **Web Push will NOT translate** — native clients use APNs / FCM. The `push_subscriptions` schema **already** supports multiple kinds (`web`, `apns`, `fcm`) with nullable web-specific fields and a `device_token` column for native — see [02 — Database](./02-database.md). The dispatcher today only iterates `kind = 'web'` rows; native code paths are ready to be plugged in without a migration.
6. **Deep links** — every shareable resource (profile, chat, like, photo) MUST have a stable URL pattern `https://nikah.help/<resource>/<id>`. The native app will use **Universal Links** (iOS) and **App Links** (Android) on the same URLs. Document `apple-app-site-association` and `assetlinks.json` slots in `public/.well-known/` for later population.
7. **CSRF** — Server Actions rely on the browser Origin header. Route Handlers MUST validate `Origin` against an allowlist that, in the future, includes the native app's bundle identifier mapping (or use signed app tokens). For MVP: web-only allowlist is fine.
8. **Captcha / abuse protection** — Cloudflare Turnstile (web) won't run in native. Plan: future native client includes App Attest (iOS) / Play Integrity (Android) verification on the same endpoints. Don't bake Turnstile-specific logic into business code; isolate it in `lib/abuse/verify.ts`.
9. **Geolocation** — `navigator.geolocation` (web) → `CLLocationManager` / `FusedLocationProvider` (native). The DB column `profiles.location geography(point, 4326)` is platform-agnostic. No schema changes required.
10. **No browser-only state** — Zustand stores marked `'client-state-only'` are acceptable, but business state MUST live in TanStack Query (server-cached) or Postgres. A native rewrite must not need to reverse-engineer browser localStorage.

> **Decision:** For MVP, Server Actions are the default for writes. Pre-native release, every write SA gets a Route Handler twin reusing the same business helper and Zod schema. To make that port mechanical, today's code must keep business logic in `features/<feature>/server/*.ts` helpers and Zod schemas in `features/<feature>/schemas.ts` — never inline inside the SA function body.

### Components as Sinks

- Each module has a clear entry point, explicit inputs, a single responsibility, and completes execution without hidden cascades.
- Data flows through Zod schemas and TypeScript types from `database.types.ts` (generated by Supabase CLI).
- Global state is minimized (Zustand for UI state only, never business data).

### Security

- **Cloudflare WAF** at domain level
- **Vercel Firewall** for DDoS and bot protection
- Rate limiting via Upstash Redis + `@upstash/ratelimit` in Route Handlers
- All incoming data validated via **Zod v4** at Route Handler / Server Action level
- CSRF: Server Actions protected by Next.js 16 automatically (Origin check). Route Handlers MUST manually check `Origin` header.
- CSP headers in `next.config.ts` via `headers()`
- Secrets: Vercel env vars only. Never passed to client. `NEXT_PUBLIC_` prefix ONLY for truly public values.
- **Forbidden:** device fingerprinting, IMEI, MAC, covert tracking

### Observability

> **MANDATORY:** Sentry is the centralized error monitoring platform for the entire system. A production deploy that does not satisfy [14-sentry-observability.md](14-sentry-observability.md) MUST NOT be promoted. All runtime errors, unhandled exceptions, and 5xx API failures across Next.js, Vercel, Supabase, Edge Functions, Server Actions, Realtime, the image-processing pipeline, payments, and background jobs MUST be aggregated into Sentry. Frontend and backend monitoring are both mandatory; performance monitoring, tracing, release tracking, source maps, and environment separation (dev/staging/prod) MUST be enabled.

- **Sentry** (Next.js SDK + Deno SDK for Supabase Edge Functions) — frontend and backend errors, distributed tracing, release health, session replay (sampled, masked). See [14-sentry-observability.md](14-sentry-observability.md) for the full mandate, coverage matrix, PII rules, alerting, and rollout plan.
- **Vercel Logs** — structured JSON logging in Route Handlers (`status >= 500` events also flow to Sentry; `console.log` is forbidden in production code paths)
- **Inngest Dashboard** — background job observability (status, retries, history); function failures additionally captured in Sentry per the coverage matrix
- **Supabase Dashboard** — DB, Realtime, Storage metrics
- Personal data MUST NOT appear in logs **or in Sentry**. Only identifiers. See PII sanitization rules in [14-sentry-observability.md](14-sentry-observability.md).

### CI/CD

- Database schema: migrations via Supabase CLI (`supabase/migrations/*.sql`), committed to Git
- **Vercel Preview Deployments** + **Supabase Branching** — each PR gets an isolated test database
- Manual schema changes via Studio in production are FORBIDDEN
- Merge to `main` requires: ESLint ✅, TypeScript ✅, Vitest ✅, Playwright ✅, Build ✅

---

## Requirement: Project Structure

### Scenario: Agent navigates the codebase

**Given** the project repository
**When** an agent needs to locate a specific module
**Then** the directory structure below MUST be followed
**And** no cross-imports between `features/*/components` are allowed

```
nikah-help/
├── app/                                # Next.js 16 App Router
│   ├── (public)/                       # Public routes
│   │   ├── auth/page.tsx
│   │   └── api/auth/callback/route.ts
│   ├── (app)/                          # Authenticated routes
│   │   ├── feed/
│   │   │   ├── page.tsx                # RSC
│   │   │   └── @filters/              # Parallel route (filters)
│   │   ├── profile/
│   │   ├── chats/[chatId]/
│   │   ├── likes/
│   │   ├── notifications/
│   │   ├── settings/
│   │   ├── subscription/
│   │   └── layout.tsx                  # AppBar, Sidebar
│   ├── (admin)/
│   │   ├── admin/reports/
│   │   ├── admin/blocks/
│   │   ├── admin/users/
│   │   └── layout.tsx
│   ├── api/
│   │   ├── photos/
│   │   │   ├── upload-url/route.ts
│   │   │   ├── process/route.ts        # sharp image processing (generates all 10 variant files)
│   │   │   └── stream/route.ts         # privacy-first proxy (streams variant bytes, enforces blur)
│   │   ├── webhooks/
│   │   │   ├── tbank/route.ts          # T-Bank payment webhook
│   │   │   └── inngest/route.ts
│   │   └── push/subscribe/route.ts
│   ├── globals.css                     # Tailwind v4 @import
│   ├── layout.tsx
│   └── proxy.ts                        # Next.js 16 (NOT middleware.ts)
│
├── features/                           # Feature-based modules
│   ├── auth/
│   │   ├── actions.ts                  # 'use server' — thin SA wrappers
│   │   ├── server/                     # Pure business helpers (callable from SA OR Route Handler)
│   │   │   ├── send-magic-link.ts
│   │   │   └── ...
│   │   ├── schemas.ts                  # Zod schemas — single source of truth for inputs
│   │   ├── components/
│   │   ├── hooks/
│   │   └── types.ts
│   ├── profile/
│   ├── feed/
│   ├── likes/
│   ├── chat/
│   ├── notifications/
│   ├── subscription/
│   ├── admin/
│   └── reports/
│
├── components/
│   ├── ui/                             # shadcn/ui components
│   └── layout/                         # AppBar, Sidebar, MatchModal
│
├── lib/
│   ├── sentry/
│   │   ├── index.ts                     # Public API — re-exports all helpers
│   │   ├── types.ts                     # FlowTag, SentrySeverity, SentryExtra, CaptureOptions
│   │   ├── capture.ts                   # captureSentryException, captureMessage, CODE_TO_FLOW
│   │   ├── scrub.ts                     # scrubPii — shared beforeSend / beforeSendTransaction
│   │   ├── monitor.ts                   # withSentryMonitor for Vercel Cron jobs
│   │   └── user.ts                      # setSentryUser — id-only, typed contract
│   ├── supabase/
│   │   ├── client.ts                   # createBrowserClient
│   │   ├── server.ts                   # createServerClient
│   │   └── proxy.ts                    # updateSession helper
│   ├── inngest/
│   │   ├── client.ts
│   │   └── functions/
│   │       ├── photo-moderate.ts            # OpenAI Vision moderation
│   │       ├── photo-delete.ts              # variants cleanup on user-initiated delete
│   │       ├── photo-replace-cleanup.ts     # delete OLD photo after new one is approved
│   │       ├── photo-abandon-cleanup.ts     # cleanup pending uploads that never completed
│   │       ├── profile-regenerate-bio.ts    # OpenAI bio regeneration (3/24h)
│   │       ├── account-delete.ts
│   │       ├── chat-delete.ts
│   │       ├── like-revoke.ts
│   │       └── notification-dispatch.ts
│   ├── tbank/
│   │   ├── client.ts                   # T-Bank API client
│   │   └── webhook.ts                  # webhook signature verification
│   ├── openai/
│   │   └── client.ts
│   ├── ratelimit/
│   │   └── index.ts
│   ├── web-push/
│   │   ├── register.ts                 # client-side SW registration + subscribe
│   │   └── send.ts                     # server-side dispatcher (web-push lib)
│   ├── image-processing/
│   │   └── pipeline.ts                 # sharp encoding pipeline
│   ├── crypto/
│   │   └── email-hash.ts               # peppered SHA-256 for blocks.blocked_email_hash
│   └── utils/
│       ├── cn.ts                       # clsx + tailwind-merge
│       └── format.ts
│
├── supabase/
│   ├── migrations/
│   │   ├── 0001_enable_postgis.sql
│   │   ├── 0002_profiles.sql
│   │   ├── 0003_photos.sql
│   │   ├── 0004_likes_matches_chats.sql
│   │   └── ...
│   ├── seed.sql
│   └── config.toml
│
├── sentry.client.config.ts             # Browser SDK init
├── sentry.server.config.ts             # Node runtime SDK init
├── sentry.edge.config.ts               # Edge runtime SDK init (minimal)
├── instrumentation.ts                  # Next.js register hook + onRequestError export
├── types/
│   ├── database.types.ts               # supabase gen types typescript
│   └── globals.d.ts
│
├── messages/
│   ├── ru.json
│   └── en.json
│
├── public/
│   ├── sw.js                           # Web Push Service Worker (root scope)
│   ├── manifest.webmanifest            # PWA manifest (linked from <head>)
│   ├── icon-192.png                    # Maskable + any-purpose
│   ├── icon-512.png                    # Splash + install prompt
│   ├── icon-maskable-512.png
│   ├── apple-touch-icon.png            # 180×180 for iOS Add-to-Home
│   └── badge-72.png                    # Web Push badge (Android)
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .env.local.example
├── next.config.ts
├── postcss.config.mjs
├── vitest.config.mts
├── playwright.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

### Structural Rules

- `proxy.ts` (Next.js 16) — NEVER `middleware.ts`
- Feature-based decomposition. No cross-imports between `features/*/components`
- Server Actions in `features/<feature>/actions.ts` with `'use server'` directive
- Each Inngest function in its own file, single responsibility
- `next.config.ts` — native TypeScript (Next.js 16 supports without flags)

---

## Requirement: Environment Variables

### Scenario: Agent configures environment

**Given** a fresh deployment
**When** environment variables are set in Vercel
**Then** only the variables listed below are defined
**And** `NEXT_PUBLIC_` prefix is used only for truly public values
**And** `SUPABASE_SECRET_KEY` and other secrets are NEVER exposed to the client

```bash
# Supabase (new key format)
SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...              # SERVER ONLY

# T-Bank Internet Acquiring
TBANK_TERMINAL_KEY=...
TBANK_API_TOKEN=...
NEXT_PUBLIC_TBANK_TERMINAL_KEY=...
TBANK_NOTIFICATION_URL=https://your-domain.com/api/webhooks/tbank

# OpenAI
OPENAI_API_KEY=sk-...

# Inngest
INNGEST_SIGNING_KEY=signkey-...
INNGEST_EVENT_KEY=...

# Upstash Redis (rate limiting)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Web Push
VAPID_PUBLIC_KEY=...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:...

# Resend (email)
RESEND_API_KEY=re_...

# Sentry
SENTRY_DSN=https://...@sentry.io/...
NEXT_PUBLIC_SENTRY_DSN=...
NEXT_PUBLIC_SENTRY_ENV=production      # production | staging | development
SENTRY_AUTH_TOKEN=...                  # Server-only, build-time only — source map upload
SENTRY_ORG=nikah-help
SENTRY_PROJECT=web
# SENTRY_RELEASE and NEXT_PUBLIC_SENTRY_RELEASE are auto-injected
# by the Vercel ↔ Sentry integration at deploy time

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=phc_...        # Client (write-only project key)
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
POSTHOG_API_KEY=phx_...                # Server-only, used for server-side events

# Cloudflare (cache invalidation API)
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ZONE_ID=...

# Vercel Cron — shared secret for cron Route Handler authorization
VERCEL_CRON_SECRET=...

# Server-only pepper for hashing blocked-user emails in `blocks.blocked_email_hash`.
# Generate once via `openssl rand -base64 48` and never rotate without a planned rebind migration.
BLOCKED_EMAIL_PEPPER=...
```

> **Decision:** `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are duplicated with `NEXT_PUBLIC_*` variants intentionally — the non-public versions are read by Server Actions/Route Handlers (no client-bundle exposure), the public ones by browser components. If your Supabase Anonymous-key flow is unchanged, you may collapse to `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only and read those server-side as well — Next.js exposes them at build time but they remain safe to be public.

---

## Requirement: AI Agent Development Rules

### Scenario: Agent begins a new task

**Given** a development task assigned to an AI agent
**When** the agent starts work
**Then** the following rules MUST be followed in order:

1. **Verify versions** — run `npm dist-tag ls <package>` before installing any package. Install with explicit version: `pnpm add <package>@<latest-version>`.
2. **Study existing code** — before writing, inspect the project structure (`ls -la`, `cat package.json`). Never duplicate existing utilities.
3. **Before migration** — verify compatibility with current schema. Never break existing RLS policies.
4. **After writing code** — run `pnpm typecheck` + `pnpm lint`. Fix all errors before completing.
5. **Tests** — write tests simultaneously with code. Never defer testing.
6. **Security by default:**
   - Every mutation: Zod v4 validation
   - Every DB query: RLS enforcement
   - Never expose `SUPABASE_SECRET_KEY` to client
   - Never return unnecessary data to client
7. **Documentation** — each Server Action, Route Handler, and Inngest function must include JSDoc describing inputs and outputs.
8. **Commits** — Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`).
9. **Ambiguity** — if a task is ambiguous, ask clarifying questions. Never make assumptions about business logic.
10. **Architecture changes** — if an architectural decision is changed, update the relevant documentation file.

### Absolutely Forbidden Patterns

```typescript
// ❌ Pages Router (deprecated)
// pages/_app.tsx, pages/index.tsx, getServerSideProps, getStaticProps

// ❌ Deprecated Supabase package
import { ... } from '@supabase/auth-helpers-nextjs'

// ❌ Legacy Next.js router
import { useRouter } from 'next/router'       // use next/navigation!

// ❌ middleware.ts (Next.js 16: use proxy.ts)

// ❌ Tailwind v3 syntax
// @tailwind base; @tailwind components; @tailwind utilities;
// tailwind.config.js / tailwind.config.ts

// ❌ TanStack Query v3/v4 positional syntax
// useQuery(['key'], fetchFn)

// ❌ Zod v3 syntax without explicit v4 import
// { message: 'string' } — use { error: 'string' }

// ❌ Class components
class MyComponent extends React.Component { ... }

// ❌ useEffect for server-side data fetching (use RSC)

// ❌ Service Role key on client
// SUPABASE_SECRET_KEY — server-side only!

// ❌ getSession() for authorization (use getClaims()/getUser())

// ❌ Google OAuth or Apple OAuth (Magic Link only)

// ❌ Stripe SDK or Stripe API references

// ❌ External image transformation services (use sharp in Route Handlers)

// ❌ Mock data at any stage (use real data from Supabase)
```

### Mandatory Patterns

```typescript
// ✅ App Router, RSC, Server Actions
// ✅ @supabase/ssr (createServerClient, createBrowserClient)
// ✅ next/navigation (useRouter, useSearchParams, redirect)
// ✅ proxy.ts (Next.js 16)
// ✅ Tailwind v4: @import "tailwindcss" in globals.css
// ✅ TanStack Query v5: { queryKey: [...], queryFn: ... }
// ✅ Zod v4: import { z } from 'zod'
// ✅ getClaims()/getUser() for server-side authorization
// ✅ 'use client' only when explicitly needed (hooks, event handlers)
// ✅ next.config.ts (TypeScript config — Next.js 16 native)
```

---

## Cross-References

- [01 — Authentication & Onboarding](./01-auth.md)
- [02 — Database Schema & RLS](./02-database.md)
- [03 — Profiles, Feed & Matching](./03-profiles-feed.md)
- [04 — Chat, Realtime & Notifications](./04-chat-realtime.md)
- [05 — Payments (T-Bank)](./05-payments.md)
- [06 — Image Processing & Storage](./06-image-processing.md)
- [07 — Infrastructure, Testing & i18n](./07-infrastructure.md)
- [08 — Reports, Moderation & Suspensions](./08-moderation.md)
- [09 — Error Handling System](./09-error-handling.md)
- [10 — Rate Limiting](./10-rate-limiting.md)
- [11 — Idempotency & Resilience](./11-idempotency.md)
- [12 — Notifications & Web Push](./12-notifications.md)
- [13 — Photo Variants](./13-photo-variants.md)
- [14 — Sentry: Centralized Error Monitoring & Observability (MANDATORY)](./14-sentry-observability.md)
