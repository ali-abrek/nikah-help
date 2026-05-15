# 07 — Infrastructure, Testing & i18n

## Purpose

This file defines deployment (Vercel), CDN/DNS (Cloudflare), CI/CD pipeline, monitoring and observability, internationalization (next-intl), the design system (Tailwind v4 + shadcn/ui), testing strategy, and security configuration.

---

## Requirement: Vercel Deployment

### Scenario: Project is deployed to Vercel

**Given** the GitHub repository connected to Vercel
**When** code is pushed to `main`
**Then** Vercel automatically builds and deploys to production
**And** all environment variables are set in Vercel Project Settings
**And** Node.js version is set to `22.x` LTS in `vercel.json` or Project Settings

### Scenario: Pull request gets Preview Deployment

**Given** an open PR
**When** Vercel creates a Preview Deployment
**Then** Supabase Branching creates an isolated test database
**And** the Preview URL is unique per PR
**And** E2E tests run against the Preview URL

### `vercel.json`

```json
{
  "functions": {
    "app/api/photos/process/route.ts": {
      "maxDuration": 30
    }
  },
  "crons": [
    { "path": "/api/cron/subscription-renewal",  "schedule": "0 9 * * *"  },
    { "path": "/api/cron/expire-suspensions",    "schedule": "*/15 * * * *" },
    { "path": "/api/cron/inactive-account-warn", "schedule": "0 10 * * *" }
  ]
}
```

---

## Requirement: Scheduled Tasks (Cron)

The system runs two kinds of scheduled tasks:

1. **Vercel Cron Jobs** — invoke a Route Handler. Use for tasks that need application logic (queries + business rules + Inngest event emit).
2. **`pg_cron`** — pure SQL maintenance tasks. Use for cleanup that does not touch the application layer.

### Vercel Cron Tasks

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/subscription-renewal` | `0 9 * * *` (daily 09:00 UTC) | Find subscriptions where `current_period_end` is within 24h and `cancel_at_period_end = false`. Emit `subscription/renew` Inngest event |
| `/api/cron/expire-suspensions` | `*/15 * * * *` | Find `user_suspensions` where `expires_at <= now()` and `lifted_at IS NULL`; auto-set `lifted_at = now()` and emit `user/suspension-expired` notification |
| `/api/cron/inactive-account-warn` | `0 10 * * *` | Find users with `last_seen_at < now() - 90 days` and no warning sent; send Resend email "We miss you" |

Every cron Route Handler MUST verify the `Authorization: Bearer ${VERCEL_CRON_SECRET}` header (Vercel sends it automatically). Reject otherwise.

```typescript
// app/api/cron/subscription-renewal/route.ts
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.VERCEL_CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  // ... business logic
}
```

### `pg_cron` Tasks

| Job name | Schedule | SQL |
|---|---|---|
| `cleanup_idempotency_keys` | hourly | `DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours';` |
| `refresh_last_seen_offline` | every 5 min | Bulk-update `profiles.last_seen_at = now()` for users whose Realtime presence dropped (driven by a sentinel table updated by Inngest) |
| `purge_deleted_profiles` | daily 02:00 | Hard-delete `profiles` rows in state `deletion_status = 'deleted'` older than 30 days (audit grace period) |
| `vacuum_analyze_hot_tables` | nightly 03:00 | `VACUUM ANALYZE messages, photos, likes, notifications;` |

Setup migration:

```sql
-- supabase/migrations/0050_cron_jobs.sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup_idempotency_keys',
  '0 * * * *',
  $$DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'$$
);

SELECT cron.schedule(
  'purge_deleted_profiles',
  '0 2 * * *',
  $$DELETE FROM profiles WHERE deletion_status = 'deleted' AND updated_at < now() - interval '30 days'$$
);
```

---

## Requirement: Cloudflare Configuration

### Scenario: Traffic flows through Cloudflare

**Given** the domain is configured with Cloudflare DNS pointing to Vercel
**When** a request arrives
**Then** Cloudflare provides:
- **WAF** — Web Application Firewall (OWASP rules, rate limiting on auth endpoints)
- **CDN** — Aggressive caching for static assets and image variants
- **DNS** — Domain management

### Cache Rules for Images

```
Cache Rule: /api/photos/sign*
  Cache-Control: public, max-age=31536000, immutable
  Query string: included in cache key
```

### WAF Rules

- Rate limit `/auth/callback` — 10 requests/minute per IP
- Rate limit `/api/photos/sign` — 60 requests/minute per IP
- Block known bot patterns
- Challenge suspicious requests (JS challenge)

### CSP Headers — Nonce-Based

> **Decision:** CSP MUST use **per-request nonces** (not `'unsafe-inline'`). Next.js 16 inlines a small bootstrap script that needs `nonce`. Nonces are generated in `proxy.ts` and propagated to RSC via headers + `headers()` reader.

#### `proxy.ts` — generate the nonce

```typescript
// proxy.ts
import { NextResponse, NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://integrationjs.t-static.ru`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' https://*.supabase.co data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tbank.ru https://api.openai.com https://app.posthog.com https://*.sentry.io`,
    `media-src 'self' https://*.supabase.co blob:`,                  // voice + image messages
    `worker-src 'self' blob:`,                                       // service worker for Web Push
    `manifest-src 'self'`,                                           // PWA manifest
    `frame-src *.tbank.ru`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = await updateSession(request, { requestHeaders })
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'geolocation=(self), microphone=(self), camera=()')
  return response
}

export const config = { matcher: '/((?!_next/static|_next/image|favicon.ico).*)' }
```

#### Reading the nonce in RSC

```tsx
// app/layout.tsx
import { headers } from 'next/headers'

export default async function RootLayout({ children }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <html lang="ru">
      <body>
        {children}
        <script nonce={nonce} src="https://integrationjs.t-static.ru/integration.js" async />
      </body>
    </html>
  )
}
```

#### CSP rules summary

| Directive | Purpose |
|---|---|
| `script-src 'nonce-...' 'strict-dynamic'` | Block inline scripts; allow only Next.js bundle + T-Bank script with explicit nonce |
| `worker-src 'self' blob:` | Allow `/sw.js` registration for Web Push |
| `media-src 'self' blob: https://*.supabase.co` | Voice/image messages from Storage + `MediaRecorder` blobs |
| `font-src 'self' data:` | `next/font` self-hosting + inlined data URIs |
| `connect-src wss://*.supabase.co` | Realtime WebSocket |
| `frame-ancestors 'none'` | Prevent clickjacking |

---

## Requirement: CI/CD Pipeline (GitHub Actions)

### Scenario: PR is validated

**Given** a PR opened against `main`
**When** GitHub Actions runs
**Then** the following checks MUST pass:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: latest }
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Unit + Integration tests
        run: pnpm test:ci
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
          SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}

      - name: Build
        run: pnpm build

      - name: E2E tests
        run: pnpm test:e2e
        env:
          PLAYWRIGHT_BASE_URL: ${{ github.event.deployment_status.target_url }}
```

### Branch Protection

Merge to `main` is BLOCKED without:
- ESLint ✅
- TypeScript ✅
- Vitest ✅
- Playwright ✅
- Build ✅

---

## Requirement: Testing Strategy

### Test Levels

| Level | Scope | Tool |
|---|---|---|
| Unit | Business logic, utilities, Zod schemas, Inngest functions | **Vitest** |
| Component | React components, forms | **Vitest + React Testing Library** |
| Integration | Supabase (DB, RLS, Realtime) on Supabase Branch | **Vitest + Supabase JS client** |
| E2E | Auth, chat, photos, likes, payments | **Playwright** |

### Scenario: Unit tests are written for business logic

**Given** a new Server Action, utility function, or Zod schema
**When** the code is written
**Then** unit tests MUST be written before merge
**And** coverage thresholds: lines ≥ 80%, functions ≥ 80%, branches ≥ 75%
**And** test naming: `should_<expected>_when_<condition>`
**And** one hypothesis per test

### Vitest Configuration

```typescript
// vitest.config.mts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
})
```

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom/vitest'
```

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

### Security Testing

- RLS policy tests: attempt bypass with different roles on Supabase Test Branch
- Idempotency tests: double call = single effect
- Zod v4 validation tests: boundary cases for every endpoint
- Session tests: invalid/expired Supabase Auth session handling

### No Mock Data

The system MUST be tested with real data from Supabase. Integration tests use Supabase Branching (isolated test database with real migrations and seed data). Component tests may use MSW for HTTP mocking only where external services are involved (OpenAI, T-Bank).

---

## Requirement: Internationalization (next-intl)

### Scenario: App supports multiple languages

**Given** the application
**When** it is configured for i18n
**Then** Russian and English MUST be available from day one
**And** adding a new language = adding `messages/{locale}.json`, no logic changes
**And** hardcoded text is FORBIDDEN (enforced by ESLint rule)
**And** missing translations cause TypeScript errors (strict key types)
**And** fallback: missing translation → default locale (`ru`), then English as last resort

### Configuration

```typescript
// i18n/routing.ts
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['ru', 'en'],
  defaultLocale: 'ru',
})
```

### Message Structure

```json
// messages/ru.json
{
  "common": {
    "button": { "save": "Сохранить", "cancel": "Отмена" }
  },
  "auth": {
    "error": { "invalid_email": "Неверный email" }
  },
  "notifications": {
    "like_received": "{name} заинтересовался вашей анкетой"
  }
}
```

### Language Detection

| Condition | Language |
|---|---|
| Russia / CIS + `Accept-Language` = ru | Russian |
| Cloudflare `cf-ipcountry` ∈ CIS + language ≠ en | Russian |
| `Accept-Language` = en | English |
| Outside CIS + language ≠ ru | English |
| Outside CIS + language = ru | Russian |

### Language Sync

- Language stored in cookie `NEXT_LOCALE` + `profiles.locale`
- Web Push: backend reads `profiles.locale` → `next-intl` server API → translated text
- Notifications store i18n keys (`title_key`, `body_key`) + `payload`; client renders translations

---

## Requirement: Design System

### Theme (next-themes + Tailwind CSS v4)

- Light and dark themes. Default: system preference (`prefers-color-scheme`)
- Manual toggle → `localStorage` + `profiles.theme_preference`
- Tailwind v4 dark mode: `dark:` classes via CSS `prefers-color-scheme` or `data-theme` attribute

### Color Tokens

```css
@theme {
  --color-accent-1: #F9C784;
  --color-accent-2: #FCAF58;
  --color-accent-3: #FF8C42;

  --color-primary: var(--color-accent-3);
  --color-primary-hover: var(--color-accent-2);
}

:root {
  --background: #FFFFFF;
  --foreground: #111111;
  --surface: #F5F5F5;
  --border: #E2E2E2;
}

.dark {
  --background: #4E598C;
  --foreground: #F5F5F5;
  --surface: #3E4870;
  --border: #5A6499;
}
```

Hex values in JSX/CSS are FORBIDDEN. Only CSS variables via classes.

### Typography

- Primary font: **Inter** via `next/font/google`
- Hierarchy: `text-headline-1`, `text-headline-2`, `text-body`, `text-caption`
- All sizes multiples of 8px

### Component Library (shadcn/ui + Radix UI)

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button input dialog sheet switch checkbox
```

Each component MUST support states: `default`, `hover`, `active`, `disabled`, `loading`.

Key components:
- **Button**: `default` (accent), `secondary`, `ghost`, `destructive`
- **Input**, **Textarea**, **Combobox**, **DatePicker**, **Slider**, **Switch**, **Checkbox**
- **Card** — profile card in feed
- **Avatar** — 100×100, uses `<picture>` with AVIF/WebP
- **PhotoSlider** — 4:5, `object-fit: cover`
- **Dialog** / **Sheet** (drawer) — Radix UI
- **Toast** — via `sonner`
- **FullscreenMatchModal** — two avatars + "Go to Chat" button

### Navigation Routes

```
/                              → redirect /auth or /feed
/auth                          → Magic Link form
/api/auth/callback/route.ts    → Supabase code exchange
/onboarding                    → 4-step onboarding
/feed                          → Feed (SSR + Realtime)
/feed/filters                  → Filters (Intercepting Routes → Modal)
/profile                       → Own profile
/profile/edit                  → Edit profile
/profile/[id]                  → Other user's profile
/likes                         → Likes (3 tabs)
/chats                         → Chat list
/chats/[chatId]                → Chat detail
/notifications                 → Notification center
/settings                      → Language, theme
/settings/blocked              → Personal blocklist (search + unblock)
/subscription                  → T-Bank payment form
/admin                         → Admin panel (RBAC)
/admin/reports                 → Reports (moderator+)
/admin/blocks                  → Block list view (moderator+, lift = admin)
/admin/users                   → Users (admin)
/api/photos/upload-url         → Signed upload URL
/api/photos/process            → sharp image processing
/api/photos/sign               → Signed access URL
/api/webhooks/tbank            → T-Bank payment webhook
/api/webhooks/inngest          → Inngest endpoint
/api/push/subscribe            → Web Push subscription
```

**All screens MUST handle:** Suspense + skeleton (loading), empty state, error boundary with retry.

---

## Requirement: PWA (manifest, icons, install)

The app is delivered as a Progressive Web App. The Web Push Service Worker (`public/sw.js`, defined in [04 — Chat](./04-chat-realtime.md)) is sufficient for push, but installability and a native-feeling launch require a manifest and icons.

### `public/manifest.webmanifest`

```json
{
  "name": "Nikah Help",
  "short_name": "Nikah Help",
  "description": "Платформа знакомств для мусульман",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#FFFFFF",
  "theme_color": "#FF8C42",
  "lang": "ru",
  "dir": "ltr",
  "icons": [
    { "src": "/icon-192.png",          "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png",          "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### Linking from `<head>`

```tsx
// app/layout.tsx — inside <head>
export const metadata = {
  title: { default: 'Nikah Help', template: '%s · Nikah Help' },
  description: 'Платформа знакомств для мусульман',
  manifest: '/manifest.webmanifest',
  themeColor: '#FF8C42',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Nikah Help',
  },
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192' }, { url: '/icon-512.png', sizes: '512x512' }],
    apple: '/apple-touch-icon.png',
  },
}
```

### Icons checklist

| File | Size | Purpose |
|---|---|---|
| `icon-192.png` | 192×192 | Standard install + Web Push notifications |
| `icon-512.png` | 512×512 | Splash screen, large install tile |
| `icon-maskable-512.png` | 512×512 | Android adaptive (safe area: center 80%) |
| `apple-touch-icon.png` | 180×180 | iOS Home Screen |
| `badge-72.png` | 72×72 | Web Push small badge (Android) |
| `favicon.ico` | 32×32 + 16×16 | Browser tab |

### Install prompt UX

> **Decision:** The install prompt is shown **after the user's first mutual match**. This is the highest-engagement moment in the funnel; users who matched are the most likely to want a permanent home-screen presence.

Implementation:
- The browser fires `beforeinstallprompt` opportunistically; capture the event in a Zustand store and prevent the default UA chip via `event.preventDefault()`.
- Listen for the `match.created` Realtime Broadcast event on `user:${userId}` (the same event that powers the fullscreen match modal — see [03 — Likes System](./03-profiles-feed.md#requirement-likes-system)).
- After the user closes the match modal, if a captured `beforeinstallprompt` is in the store AND the user has not previously dismissed/accepted, render a slim banner at the top: "Add Nikah Help to your home screen for instant access. [Install] [Not now]".
- "Install" calls `event.prompt()` and awaits `event.userChoice`. Outcome stored in `localStorage.pwa_install_outcome ∈ {'accepted','dismissed'}`.
- "Not now" sets `pwa_install_outcome = 'snoozed'`. The banner is suppressed for 14 days, then eligible again on the next mutual match.
- Once `pwa_install_outcome ∈ {'accepted','dismissed'}`, NEVER show the banner again.
- If the browser does not fire `beforeinstallprompt` (e.g. iOS Safari), do nothing here. iOS gets the dedicated "Install on iPhone" guidance described below in the iOS specifics section, surfaced from the "Enable notifications" flow.
- Never fire `prompt()` automatically without a user gesture.

### iOS specifics

iOS Safari does NOT support Web Push for sites that are not Add-to-Home-Screen-installed. If the user's environment is iOS Safari:
- The "Enable notifications" button should explain: "On iPhone, install Nikah Help to your Home Screen first, then open it from there."
- Detect via `('standalone' in navigator) && !navigator.standalone`.

---

## Requirement: Performance Budget & Core Web Vitals

> **Decision:** We target Google's **"Good"** thresholds at the **75th percentile** of real users (RUM via Vercel Analytics). The page-level enforcement is in CI via `@lhci/cli` (Lighthouse) on key routes; the field-level enforcement is via Vercel Analytics + Sentry alerts.

### Field thresholds (75th percentile, real users)

| Metric | Target | What it covers |
|---|---|---|
| **LCP** (Largest Contentful Paint) | ≤ **2.5 s** | Time until the main content (feed grid, profile photo, match modal) is rendered |
| **INP** (Interaction to Next Paint) | ≤ **200 ms** | Tap-to-feedback responsiveness, replaces FID since 2024 |
| **CLS** (Cumulative Layout Shift) | ≤ **0.1** | No content shift after photos load — reserve aspect-ratio boxes for `<picture>` |
| **FCP** (First Contentful Paint) | ≤ **1.8 s** | First paint of any meaningful content |
| **TTFB** (Time to First Byte) | ≤ **800 ms** | Edge response from Vercel + Supabase round-trip |

### Lab thresholds (Lighthouse, mobile, fast-3G throttling)

| Route | Performance score |
|---|---|
| `/feed` | ≥ 90 |
| `/auth` | ≥ 95 |
| `/profile/[id]` | ≥ 90 |
| `/chats/[chatId]` | ≥ 85 (Realtime + media) |

### Bundle budgets (per route, gzip)

| Bundle | Budget |
|---|---|
| Initial JS for `/feed` (RSC + client) | ≤ **150 KB** |
| Initial JS for `/auth` | ≤ **80 KB** |
| Per-route incremental | ≤ **40 KB** |
| Initial CSS (Tailwind purged) | ≤ **30 KB** |

Enforced via `next build` output size checks in CI (fail PR if a route exceeds budget by >10 %).

### How the budgets translate to code rules

- Avatar (96×96) MUST be served as AVIF/WebP via `<picture>` with `width`/`height` attributes — covers CLS.
- Feed cards lazy-load below-fold profiles via `IntersectionObserver`.
- Realtime channel subscriptions are deferred to `requestIdleCallback` after first paint on `/chats/[chatId]`.
- Server-side rendering is the default; client islands are added only where interactivity is required (filters, photo upload, chat composer).
- Tailwind v4 emits a single CSS bundle; verify in CI that purged CSS for `/feed` is ≤ 30 KB gzip.

### Dashboards & alerts

- **Vercel Analytics** — RUM metrics by route. Alert (Slack) if 75th percentile LCP > 3 s for 6 hours.
- **Sentry Performance** — backend Route Handler P75 latency. Alert if `/api/photos/process` P95 > 8 s.
- **Lighthouse CI** — runs on every PR Preview deploy via GitHub Actions.

---

## Requirement: Monitoring

> **AUTHORITATIVE:** [14-sentry-observability.md](14-sentry-observability.md) is the single source of truth for the Sentry mandate, coverage matrix, sampling, PII rules, alerting, and rollout. The Sentry subsection below is the **infrastructure-level wiring** — DSN/env vars, Vercel integration, source-map upload, deploy verification. Coverage requirements (which flows MUST report) live in 14.

### Sentry — MANDATORY

- Next.js SDK initialized in `sentry.client.config.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts`
- Centralized `lib/sentry/` module (required — no direct `Sentry.captureException` in application code):
  - `captureSentryException(error, opts)` — typed, flow-tagged exception capture
  - `withSentryMonitor(slug, handler, schedule)` — cron job heartbeat + missed-run alerting
  - `setSentryUser(userId)` — id-only user context (type-enforced, no PII)
  - `scrubPii(event)` — shared `beforeSend` hook, four-layer PII defense
- Supabase Edge Functions use `@sentry/deno` (see 14)
- Error tracking on both frontend and backend (mandatory; production deploy gated on Release Health)
- Distributed tracing across Route Handlers, Server Actions, Inngest, and Edge runtime
- Source maps uploaded on every Vercel build (NOT served to clients); production build fails if upload fails
- Release tags = `nikah-help@<VERCEL_GIT_COMMIT_SHA>` finalized with `setCommits: { auto: true }`
- Three Sentry environments: `development`, `staging`, `production` — alerts scoped to `production` only
- Vercel ↔ Sentry integration installed at the project level (auto-injects env vars, creates releases)
- Flow taxonomy via `FlowTag` union in `lib/sentry/types.ts` — all events carry a `flow` tag for alert routing and ownership assignment

#### Configuration

Install:
```bash
pnpm add @sentry/nextjs
pnpm dlx @sentry/wizard@latest -i nextjs
```

`next.config.ts` wraps the export with `withSentryConfig`:

```typescript
// next.config.ts
import { withSentryConfig } from '@sentry/nextjs'
const nextConfig: NextConfig = { /* ... */ }

export default withSentryConfig(nextConfig, {
  org: 'nikah-help',
  project: 'web',
  silent: !process.env.CI,
  // Source maps
  widenClientFileUpload: true,
  hideSourceMaps: true,           // Source maps uploaded to Sentry, NOT served to clients
  disableLogger: true,            // Strip Sentry's internal logger from client bundle
  // Auth token for upload — set in Vercel as SENTRY_AUTH_TOKEN (NOT public)
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Release tagging
  release: { name: process.env.VERCEL_GIT_COMMIT_SHA },
})
```

Sentry SDK init files:

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs'
import { scrubPii } from '@/lib/sentry/scrub'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  environment: process.env.VERCEL_ENV ?? 'development',
  tracesSampleRate: process.env.VERCEL_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: process.env.VERCEL_ENV === 'production' ? 0.01 : 0.1,
  replaysOnErrorSampleRate: 1.0,
  sendDefaultPii: false,
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

```typescript
// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs'
import { scrubPii } from '@/lib/sentry/scrub'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  environment: process.env.VERCEL_ENV ?? 'development',
  sendDefaultPii: false,
  tracesSampleRate: process.env.VERCEL_ENV === 'production' ? 0.1 : 1.0,
  beforeSend: scrubPii,
  beforeSendTransaction: scrubPii,
})
```

```typescript
// sentry.edge.config.ts
import * as Sentry from '@sentry/nextjs'
import { scrubPii } from '@/lib/sentry/scrub'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  environment: process.env.VERCEL_ENV ?? 'development',
  tracesSampleRate: 0.05,
  sendDefaultPii: false,
  beforeSend: scrubPii,
})
```

#### Required env vars

```bash
SENTRY_DSN=https://...@sentry.io/...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...                 # Server-only, used for source-map upload during build
SENTRY_ORG=nikah-help
SENTRY_PROJECT=web
```

Add `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` to `next.config.ts` `env` block so the client bundle has the release tag:

```typescript
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
  },
}
```

#### PII rules

Sentry is configured with a four-layer PII defense per [14-sentry-observability.md](14-sentry-observability.md):

1. **`sendDefaultPii: false`** in all three SDK configs — blocks automatic attachment of request bodies, headers, cookies, and IPs.
2. **`scrubPii`** from `lib/sentry/scrub` — attached as `beforeSend` and `beforeSendTransaction` in all configs. Strips: `cookie`, `authorization`, `x-api-key`, any header matching `*token*`/`*secret*`/`*key*`; query params `code`, `token`, `access_token`, `refresh_token`, `apikey`; signed Storage URLs; body fields `email`, `password`, `phone`, `chat_message`, `message_text`, `photo_url`, `token`; user context (replaced with `{ id }` only). Drops `debug` events in production.
3. **Replay masking** — `maskAllText: true`, `maskAllInputs: true`, `blockAllMedia: true`, `lazyLoad: true`. Routes `/onboarding`, `/profile/edit`, `/admin/*`, `/chat/*` excluded from replay.
4. **`setSentryUser` id-only contract** — TypeScript type accepts only `id: string`. Safety net: `scrubPii` strips all other user fields even if a bypass occurs.

- `beforeSend` removes `user.email` and `user.username` from every event — only `user.id` survives.
- Replay integration uses `maskAllText: true` + `maskAllInputs: true` + `blockAllMedia: true`. No raw chat text or photo bytes ever reach Sentry.
- Breadcrumbs disabled for `console.log` containing `email` or `phone` substrings (custom `beforeBreadcrumb`).

#### Releases & deploy notifications

- Each Vercel deploy creates a new Sentry release tagged `<commit-sha>` with the source maps attached.
- The `@sentry/cli` (built into `withSentryConfig`) finalizes the release with `setCommits` so Sentry can show "first seen in commit X by Y".
- A Sentry → Slack integration posts a message on every release with > 0 new errors.

### Vercel Analytics + PostHog

- **Vercel Analytics** — Core Web Vitals, traffic. Always-on (anonymized).
- **PostHog** — Product analytics: funnels, feature adoption, retention. Cookie-banner-gated; users may opt out.
- **No personal data** in analytics. Only `user_id` (UUID) and event properties listed below.

#### PostHog identification

```typescript
// On successful sign-in (after Magic Link callback)
posthog.identify(user.id, {
  // No email, no name. Only product attributes.
  gender: profile.gender,
  country: profile.country,
  locale: profile.locale,
  is_premium: hasActiveSubscription,
  account_age_days: daysSince(profile.created_at),
})
```

#### PostHog Event Taxonomy

All events use **`snake_case`**. Properties are listed with type. Events outside this list MUST be added to the doc before being shipped (enforced by lint rule that whitelists event names).

##### Auth & onboarding

| Event | Properties | When |
|---|---|---|
| `auth_magic_link_requested` | `is_returning_user: boolean` | User submits email on `/auth` |
| `auth_signed_in` | `is_first_sign_in: boolean` | Magic Link callback succeeds |
| `onboarding_step_viewed` | `step: 1\|2\|3\|4` | RSC renders an onboarding step |
| `onboarding_step_completed` | `step: 1\|2\|3\|4`, `duration_ms: number` | User progresses to next step |
| `onboarding_completed` | `total_duration_ms: number`, `photo_count: number` | Step 4 → feed redirect |
| `onboarding_abandoned` | `last_step: 1\|2\|3\|4` | User leaves before completion (fired on `pagehide` if flow incomplete) |

##### Profile & photos

| Event | Properties | When |
|---|---|---|
| `profile_published` | — | `is_published` toggled to true |
| `profile_unpublished` | — | `is_published` toggled to false |
| `profile_edited` | `fields_changed: string[]`, `bio_regenerated: boolean` | User saves `/profile/edit` |
| `bio_regenerate_clicked` | `was_rate_limited: boolean` | Manual "Regenerate description" |
| `photo_uploaded` | `position: 1..6`, `format: string`, `original_size_bytes: number` | Step 4 finalizes |
| `photo_replaced` | `position: 1..6` | Existing position replaced |
| `photo_deleted` | `position: 1..6` | User-initiated delete |
| `photo_reordered` | — | After successful `reorderPhotos` |
| `photo_moderation_result` | `decision: 'approved'\|'rejected'\|'manual_review'`, `position: 1..6` | Inngest moderation finishes |

##### Feed, likes, matches

| Event | Properties | When |
|---|---|---|
| `feed_viewed` | `filter_count: number`, `radius_km: number\|null` | `/feed` SSR render |
| `feed_filter_applied` | `filter: string`, `value: string` | One filter changed |
| `profile_viewed` | `viewed_user_id: uuid` | `/profile/[id]` opens (debounced 1s) |
| `like_sent` | `target_user_id: uuid`, `likes_used_lifetime: number` | After successful `sendLike` |
| `like_blocked_by_limit` | `likes_used_lifetime: number` | Free-tier 3-likes wall hit |
| `match_created` | `match_id: uuid`, `seconds_since_my_like: number` | Match modal shown |
| `like_revoked` | `target_user_id: uuid` | After confirm |

##### Chat

| Event | Properties | When |
|---|---|---|
| `chat_opened` | `chat_id: uuid`, `unread_count: number` | `/chats/[chatId]` SSR |
| `message_sent` | `chat_id: uuid`, `type: 'text'\|'image'\|'voice'`, `length: number` (chars or seconds) | After successful `sendMessage` |
| `message_edited` | `chat_id: uuid`, `seconds_since_send: number` | After `editMessage` |
| `message_deleted` | `chat_id: uuid`, `type: 'text'\|'image'\|'voice'` | After `deleteMessage` |
| `voice_message_played` | `chat_id: uuid`, `duration_listened_pct: number` | Player onEnded or progress threshold |

##### Subscription & payments

| Event | Properties | When |
|---|---|---|
| `subscription_page_viewed` | `is_premium: boolean` | `/subscription` RSC render |
| `subscription_initiate_clicked` | — | "Subscribe" tap |
| `subscription_payment_started` | `order_id: uuid` | T-Bank iframe loaded |
| `subscription_payment_succeeded` | `order_id: uuid`, `amount_kopecks: number` | T-Bank webhook CONFIRMED |
| `subscription_payment_failed` | `order_id: uuid`, `error_code: string` | T-Bank webhook REJECTED |
| `subscription_cancelled_by_user` | — | "Cancel subscription" confirmed |
| `subscription_renewed_automatically` | — | Recurring renewal succeeds |
| `subscription_expired` | — | `current_period_end < now()` reached |

##### Notifications

| Event | Properties | When |
|---|---|---|
| `push_permission_requested` | `outcome: 'granted'\|'denied'\|'default'` | After `Notification.requestPermission` |
| `push_subscription_created` | `kind: 'web'\|'apns'\|'fcm'` | `/api/push/subscribe` succeeds |
| `notification_clicked` | `type: string`, `entity_id: uuid` | SW `notificationclick` |
| `pwa_install_prompt_shown` | — | After first match, banner rendered |
| `pwa_install_prompt_outcome` | `outcome: 'accepted'\|'dismissed'\|'snoozed'` | User chooses on banner |

##### Reports, blocks, moderation

| Event | Properties | When |
|---|---|---|
| `report_submitted` | `type: 'profile'\|'photo'`, `has_comment: boolean` | After `submitReport` |
| `user_blocked` | `target_user_id: uuid` | After `blockUser` |
| `user_unblocked` | `block_id: uuid` | After `unblockUser` |
| `account_blocked_by_moderator` | — | Server-side, fired during moderator block flow (server-to-PostHog) |
| `account_deleted` | `account_age_days: number` | After `account.delete` workflow finishes |

#### Privacy rules for events

- NEVER include free-text user content (chat messages, comments, bio) in event properties.
- NEVER include emails, phone numbers, or any direct identifiers.
- `target_user_id`, `viewed_user_id`, etc. are UUIDs only — joinable to `profiles` only inside the data warehouse.
- Server-side events (e.g. `account_blocked_by_moderator`, `subscription_payment_succeeded` from webhook) use the PostHog Node SDK with `process.env.POSTHOG_API_KEY`, NOT the client key.

### Logging

```typescript
// Structured logging in Route Handlers
console.log(JSON.stringify({
  level: 'info',
  message: 'Photo processed',
  photoId: photo.id,
  userId: user.id,
  duration: Date.now() - start,
}))
```

Personal data MUST NOT appear in logs. Only identifiers.

---

## Requirement: Scaling

- **Vercel:** Horizontal scaling of Route Handlers (automatic). Edge Network for static assets.
- **Supabase:** Supavisor (pgBouncer) for connection pooling in serverless — **transaction mode** for Route Handlers. Read replicas on Pro/Team plan for high read load.
- **PostGIS:** Spatial indexes for radius search.
- **Cloudflare:** Aggressive static + image caching. Edge rate limiting.
- **Inngest:** Auto-parallelism for background jobs. Concurrency limits for OpenAI/T-Bank API protection.
- **TanStack Query:** `staleTime` by data type (profile 5 min, feed 1 min, chat 0 = realtime).
- **Supabase Realtime v2:** Channels isolated (`chat:${id}`, `user:${id}`). RLS filters events at Postgres level.

---

## Requirement: MVP Launch Checklist

- [ ] Supabase project created, PostGIS enabled, migrations applied, RLS on all tables
- [ ] Supabase Auth: Magic Link configured. Redirect URLs set
- [ ] Supabase Storage: buckets `profile-photos`, `chat-media` — private, RLS policies applied
- [ ] Supabase Branching: enabled for Preview Deployments
- [ ] Vercel: project connected to GitHub, all env vars set
- [ ] Cloudflare: DNS → Vercel, WAF enabled, Cache Rules configured for images
- [ ] Inngest: project created, endpoint `/api/webhooks/inngest` operational
- [ ] T-Bank: terminal registered, API token issued, webhook URL configured, recurrent payments enabled
- [ ] OpenAI API key: added and tested
- [ ] Resend: email delivery operational
- [ ] VAPID keys: generated (`web-push generate-vapid-keys`), added to env
- [ ] **Sentry (MANDATORY — see [14-sentry-observability.md](./14-sentry-observability.md)):**
  - [ ] `@sentry/nextjs` installed; `sentry.{client,server,edge}.config.ts` committed
  - [ ] `instrumentation.ts` registers Node + Edge configs; exports `onRequestError`
  - [ ] `next.config.ts` wraps export with `withSentryConfig` (`hideSourceMaps`, `disableLogger`, `tunnelRoute: '/monitoring'`)
  - [ ] Vercel ↔ Sentry integration installed; DSN, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` populated
  - [ ] Three environments configured (`development`, `staging`, `production`); alerts scoped to production
  - [ ] PII scrubbing: `sendDefaultPii: false`, `beforeSend` scrubber, project-level Data Scrubbing rules
  - [ ] Replay: `maskAllText`, `maskAllInputs`, `blockAllMedia`; disabled on `/onboarding`, `/profile/edit`, `/admin/*`, `/chat/*`
  - [ ] Source-map upload verified on a real release; build fails on upload error in production
  - [ ] Coverage: every flow in the [14 mandatory list](./14-sentry-observability.md#requirement-mandatory-coverage) reports
  - [ ] Alerts + ownership rules configured per [14 Operational Standards](./14-sentry-observability.md#requirement-operational-standards)
  - [ ] **Deploy verification gate**: post-deploy check requires no new `fatal`, error count ≤ 3× baseline, crash-free users ≥ 99.5% over 30 min, no `flow=payments.*` errors in first 30 min
- [ ] CI/CD: GitHub Actions with lint/typecheck/test/build/e2e
- [ ] Branch protection on `main`
- [ ] Coverage: ≥ 80% for critical modules
- [ ] Privacy Policy, Terms of Service published
- [ ] GDPR: data export and deletion functional
- [ ] Node.js `22.x` LTS: runtime version set in Vercel Project Settings
- [ ] `pricing_plans` seeded (`subscription_monthly` row inserted)
- [ ] `pg_cron` extension enabled and jobs scheduled (`cleanup_idempotency_keys`, `purge_deleted_profiles`)
- [ ] `supabase_realtime` publication updated to include `messages`, `notifications`, `profiles`, `matches`
- [ ] Web Push `sw.js` deployed at `public/sw.js`, registered after user gesture only
- [ ] PWA: `public/manifest.webmanifest` deployed, all icons present (192, 512, maskable, apple-touch, badge), `<link rel="manifest">` in `<head>`
- [ ] GeoNames import script run; `geonames_countries` and `geonames_cities` populated; `pg_trgm` extension enabled
- [ ] CSP nonce-based config validated (no `unsafe-inline` for scripts)
- [ ] Storage buckets are private; RLS policies for `profile-photos` and `chat-media` applied
- [ ] First admin user assigned manually via SQL (`UPDATE profiles SET role = 'admin' WHERE email = ...`)
- [ ] `VERCEL_CRON_SECRET` set in Vercel; cron Route Handlers verify it

---

## Cross-References

- [00 — Overview & Architecture Principles](./00-overview.md)
- [01 — Authentication & Onboarding](./01-auth.md)
- [02 — Database Schema & RLS](./02-database.md)
- [03 — Profiles, Feed & Matching](./03-profiles-feed.md)
- [04 — Chat, Realtime & Notifications](./04-chat-realtime.md)
- [05 — Payments (T-Bank)](./05-payments.md)
- [06 — Image Processing & Storage](./06-image-processing.md)
- [08 — Reports, Moderation & Suspensions](./08-moderation.md)
