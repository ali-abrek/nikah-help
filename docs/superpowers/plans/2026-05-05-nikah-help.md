# Nikah Help — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete Muslim marriage platform (web/PWA) with auth, onboarding, AI-generated profiles, photo processing, feed with spatial search, real-time chat, payments, and moderation.

**Architecture:** Next.js 16 App Router with Supabase Postgres (RLS + PostGIS), all business logic in Route Handlers / Server Actions / Inngest background functions. Privacy-first photo delivery via server-side proxy. Realtime via Supabase Realtime v2. Payments via T-Bank Internet Acquiring.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, Supabase (Auth, Postgres, Storage, Realtime), Inngest, sharp, OpenAI, T-Bank, Upstash Redis, Resend, web-push, TanStack Query v5, shadcn/ui, next-intl, Vitest, Playwright

---

## System Understanding

### Product Summary

Nikah Help is a Muslim marriage platform where male users pay a subscription (3 lifetime likes free, unlimited with premium) and female users are free. The platform features AI-generated profile bios, privacy-first photo delivery with server-enforced blurring, real-time chat, PostGIS radius search, and moderator tools.

### Critical Components & Dependencies

1. **Supabase** — Auth (Magic Link), Postgres (RLS, PostGIS), Storage (private buckets), Realtime v2 (Changes, Broadcast, Presence)
2. **Next.js 16** — App Router, RSC, Server Actions, Route Handlers, proxy.ts
3. **Inngest** — All async work (photo moderation, bio regeneration, notifications, account deletion)
4. **OpenAI** — Bio generation (gpt-4o-mini), photo moderation (gpt-4o Vision)
5. **T-Bank** — Payment processing (iframe + REST API)
6. **sharp** — All image processing (10 variants per photo)
7. **Upstash Redis** — Rate limiting (sliding window) and idempotency (atomic locks)

### Key Architectural Decisions

- No separate backend server — all logic in Next.js Route Handlers / Server Actions / Inngest
- Dual protection: RLS at DB level + Zod validation at app level
- Photo bytes never reach browser via Storage URLs — `/api/photos/stream` proxy enforces access
- Server Actions for MVP writes; pre-native release, each gets a Route Handler twin
- `getClaims()`/`getUser()` for auth, never `getSession()`
- Magic Link only — no Google/Apple OAuth
- Composable infrastructure wrappers: `withRateLimit(withIdempotency(handler))` — rate limit outer, idempotency inner
- Centralized error handling: `AppError` thrown anywhere → `handleRouteError`/`handleActionError` at boundaries
- Notification factory: `createNotification(type, context)` → Inngest → dispatch (never inline payload construction)
- Shared photo variant config: `PHOTO_VARIANTS` as single source of truth for all dimensions/formats/compression

### Risks & Unclear Areas

- T-Bank API specifics need verification against latest docs (token generation, webhook format)
- HEIC support depends on sharp build with libheif on Vercel runtime
- GeoNames import is ~50 MB — must be excluded from Git
- CSP nonce propagation to all RSC paths needs careful testing
- Inngest idempotency guarantees need validation in integration tests (application-level idempotency via Upstash Redis now designed as safety net — see `docs/11-idempotency.md`)
- All infrastructure systems (error handling, rate limiting, idempotency, notifications, photo variants) are fully documented in `docs/09-13-*.md` and integrated into the plan as concrete tasks

### Missing Documentation Items (Questions for Stakeholders)

1. **T-Bank:** Exact webhook payload format, error codes, retry behavior — not fully specified
2. **OpenAI moderation:** ✅ Resolved — Fallback to **DeepSeek API** when OpenAI does not respond within 60 seconds.
3. **Cloudflare Cache Rules:** Exact paths and TTLs for signed URLs vs stream URLs need finalization
4. **GDPR data export format:** Not specified — what format should user data export use?
5. **Backup strategy:** Not addressed — Supabase backup schedule?
6. **Email templates:** ✅ Resolved — 6 templates provided (Magic Link, Account Blocked, Account Reinstated, Photo Removed, Inactivity, New Match) in both RU and EN. See Task 9.6.
7. **Seed data:** What test profiles/accounts needed for development?
8. **Legal:** Terms of Service content, Privacy Policy content — who provides?
9. **Error handling system:** ✅ Resolved — Full design in `docs/09-error-handling.md` (53 error codes, AppError class, boundary handlers, i18n, CI enforcement). See Phase 2 Tasks 2.6-2.8.
10. **Rate limiting system:** ✅ Resolved — Full design in `docs/10-rate-limiting.md` (withRateLimit wrapper, 6 presets, Upstash sliding window). See Phase 2 Tasks 2.9-2.10.
11. **Idempotency system:** ✅ Resolved — Full design in `docs/11-idempotency.md` (withIdempotency wrapper, atomic Redis locks, UUID v4 keys). See Phase 2 Tasks 2.11-2.12.
12. **Notification system:** ✅ Resolved — Full design in `docs/12-notifications.md` (createNotification factory, 11 types, i18n templates, channel routing). See Phase 9 Tasks 9.0-9.1.
13. **Photo variant configuration:** ✅ Resolved — Full design in `docs/13-photo-variants.md` (shared PHOTO_VARIANTS config, resolveServeVariant, upload constraints). See Phase 5 Task 5.0.

---

## Phase 0: Project Initialization & Infrastructure

**Goal:** Working project skeleton with all tooling configured, ready for feature development.

**Scope:** Next.js 16 project creation, all dependencies installed, TypeScript strict, Tailwind v4, testing framework, CI/CD pipeline, Vercel deployment.

### Tasks

#### Task 0.1: Scaffold Next.js 16 Project

**Files:**

- Create: `nikah-help/` (project root)
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`

- [ ] **Step 1: Create project**

```bash
pnpm create next-app@latest nikah-help --typescript --tailwind --app --turbopack --import-alias "@/*"
cd nikah-help
```

- [ ] **Step 2: Install production dependencies (verify latest versions first)**

```bash
# Check latest versions
npm dist-tag ls @supabase/supabase-js | tail -1
npm dist-tag ls @supabase/ssr | tail -1
npm dist-tag ls @tanstack/react-query | tail -1
# ... repeat for all packages

pnpm add @supabase/supabase-js@latest @supabase/ssr@latest \
  @tanstack/react-query@latest zod@latest zustand@latest \
  react-hook-form@latest @hookform/resolvers@latest \
  next-intl@latest next-themes@latest sonner@latest \
  inngest@latest resend@latest web-push@latest \
  openai@latest wavesurfer.js@latest sharp@latest \
  @upstash/redis@latest @upstash/ratelimit@latest
```

- [ ] **Step 3: Install dev dependencies**

```bash
pnpm add -D vitest@latest @vitest/coverage-v8@latest \
  @testing-library/react@latest @testing-library/user-event@latest \
  @testing-library/jest-dom@latest msw@latest \
  @playwright/test@latest @types/web-push@latest
```

- [ ] **Step 4: Configure tsconfig.json for strict mode**

Write `tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, bundler module resolution, path alias `@/*`.

- [ ] **Step 5: Configure Tailwind v4**

Write `globals.css` with `@import "tailwindcss"` and `@theme` block (colors, fonts). Write `postcss.config.mjs` with `@tailwindcss/postcss` plugin.

- [ ] **Step 6: Verify build**

```bash
pnpm build
# Expected: successful build
```

#### Task 0.2: Configure Linting & Formatting

**Files:**

- Create: `.eslintrc.json`
- Create: `.prettierrc`

- [ ] **Step 1: Configure ESLint with next/core-web-vitals**

```json
// .eslintrc.json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

- [ ] **Step 2: Configure Prettier**

```json
// .prettierrc
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all"
}
```

- [ ] **Step 3: Add scripts to package.json**

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "next lint",
    "format": "prettier --write .",
    "test": "vitest",
    "test:ci": "vitest run --coverage",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 4: Run lint and typecheck**

```bash
pnpm typecheck && pnpm lint
# Expected: both pass
```

#### Task 0.3: Configure Testing Infrastructure

**Files:**

- Create: `vitest.config.mts`
- Create: `vitest.setup.ts`
- Create: `playwright.config.ts`
- Create: `tests/unit/.gitkeep`
- Create: `tests/integration/.gitkeep`
- Create: `tests/e2e/.gitkeep`

- [ ] **Step 1: Write vitest.config.mts**

```typescript
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

- [ ] **Step 2: Write vitest.setup.ts**

```typescript
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Write playwright.config.ts**

```typescript
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

- [ ] **Step 4: Verify test setup**

```bash
pnpm test --run
# Expected: no tests found but config valid
```

#### Task 0.4: Configure CI/CD Pipeline

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write GitHub Actions workflow**

```yaml
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

#### Task 0.5: Environment Variables & Vercel Config

**Files:**

- Create: `.env.local.example`
- Create: `vercel.json`

- [ ] **Step 1: Write .env.local.example**

All environment variables from the spec (00-overview.md § Requirement: Environment Variables).

- [ ] **Step 2: Write vercel.json**

```json
{
  "functions": {
    "app/api/photos/process/route.ts": { "maxDuration": 30 }
  },
  "crons": [
    { "path": "/api/cron/subscription-renewal", "schedule": "0 9 * * *" },
    { "path": "/api/cron/expire-suspensions", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/inactive-account-warn", "schedule": "0 10 * * *" }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: initialize project with Next.js 16, tooling, and CI/CD"
```

**Dependencies:** None
**Expected Outcome:** Project runs, builds, lints, tests pass (no tests yet but config valid), CI workflow defined.
**Acceptance Criteria:** `pnpm dev` starts dev server, `pnpm build` succeeds, `pnpm typecheck` passes.

---

## Phase 1: Database Schema & Supabase Setup

**Goal:** Complete database schema deployed to Supabase with RLS, PostGIS, migrations, and generated TypeScript types.

**Scope:** All enum types, core tables, RLS policies, triggers (handle_new_user, handle_match), indexes, Supabase client libraries.

### Tasks

#### Task 1.1: Supabase Project & CLI Setup

**Files:**

- Create: `supabase/config.toml`
- Create: `supabase/migrations/.gitkeep`

- [ ] **Step 1: Initialize Supabase CLI**

```bash
supabase init
supabase link --project-ref <project-ref>
```

- [ ] **Step 2: Verify config.toml**

Ensure `enabled = true` for `pg_cron` extension in `supabase/config.toml`.

#### Task 1.2: Migration 0001 — Extensions & Enums

**Files:**

- Create: `supabase/migrations/0001_enums.sql`

- [ ] **Step 1: Write migration**

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enum types
CREATE TYPE user_role            AS ENUM ('user', 'moderator', 'admin');
CREATE TYPE gender_type          AS ENUM ('male', 'female');
CREATE TYPE ai_bio_status        AS ENUM ('ready', 'regenerating', 'rate_limited');
CREATE TYPE photo_status         AS ENUM ('pending', 'uploaded', 'processing', 'processed');
CREATE TYPE moderation_status    AS ENUM ('queued', 'approved', 'rejected', 'manual_review');
CREATE TYPE message_type         AS ENUM ('text', 'image', 'voice');
CREATE TYPE message_status       AS ENUM ('sent', 'delivered', 'read');
CREATE TYPE notification_status  AS ENUM ('unread', 'read');
CREATE TYPE report_type          AS ENUM ('profile', 'photo');
CREATE TYPE report_status        AS ENUM ('new', 'in_progress', 'resolved');
CREATE TYPE subscription_status  AS ENUM ('active', 'expired', 'cancelled', 'inactive');
CREATE TYPE push_kind            AS ENUM ('web', 'apns', 'fcm');
CREATE TYPE suspension_kind      AS ENUM ('warning', 'temp_ban', 'permanent_ban');
```

- [ ] **Step 2: Push migration**

```bash
supabase db push
```

#### Task 1.3: Migration 0002 — Core Tables (profiles, photos)

**Files:**

- Create: `supabase/migrations/0002_profiles_photos.sql`

Full `profiles` table, `photos` table with all columns, constraints, and indexes as defined in 02-database.md. Include the `enforce_max_photos()` trigger.

#### Task 1.4: Migration 0003 — Social Tables (likes, matches, chats, messages)

**Files:**

- Create: `supabase/migrations/0003_social.sql`

`likes`, `matches`, `chats`, `messages` tables with all columns, constraints, indexes, and `handle_match()` trigger. Include `edited_at`, `original_content`, `deleted_at` on messages.

#### Task 1.5: Migration 0004 — Notifications, Subscriptions, Push

**Files:**

- Create: `supabase/migrations/0004_notifications_subscriptions.sql`

`notifications`, `notification_preferences`, `subscriptions`, `push_subscriptions` tables. Include the `push_kind_fields_check` constraint.

#### Task 1.6: Migration 0005 — Moderation & Blocks

**Files:**

- Create: `supabase/migrations/0005_moderation.sql`

`reports`, `blocks`, `banned_emails`, `user_suspensions`, `pricing_plans`, `idempotency_keys` tables.

#### Task 1.7: Migration 0006 — RLS Policies

**Files:**

- Create: `supabase/migrations/0006_rls.sql`

All RLS policies for every table. Include `has_role()` function, `is_blocked_pair()` function, `is_user_suspended()` function, `count_likes_used()` function, `has_active_subscription()` function. Include `is_email_banned()` function.

#### Task 1.8: Migration 0007 — Realtime Publication & `pg_cron` Jobs

**Files:**

- Create: `supabase/migrations/0007_realtime_cron.sql`

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.messages,
  public.notifications,
  public.profiles,
  public.matches;

SELECT cron.schedule('cleanup_idempotency_keys', '0 * * * *',
  $$DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'$$
);

SELECT cron.schedule('purge_deleted_profiles', '0 2 * * *',
  $$DELETE FROM profiles WHERE deletion_status = 'deleted' AND updated_at < now() - interval '30 days'$$
);
```

#### Task 1.9: Migration 0008 — Storage Buckets & RLS

**Files:**

- Create: `supabase/migrations/0008_storage.sql`

Create `profile-photos` and `chat-media` private buckets. Add Storage RLS policies as defined in 06-image-processing.md.

#### Task 1.10: Migration 0009 — Seed Data

**Files:**

- Create: `supabase/seed.sql`
- Create: `supabase/migrations/0009_seed.sql`

Insert `pricing_plans` row (`subscription_monthly`, 100000 kopecks, 30 days).

#### Task 1.11: Migration 0010 — geonames Schema

**Files:**

- Create: `supabase/migrations/0010_geonames.sql`

`geonames_countries` and `geonames_cities` tables with indexes and RLS policies.

#### Task 1.12: Generate Database Types

- [ ] **Step 1: Generate TypeScript types**

```bash
supabase gen types typescript --linked > types/database.types.ts
```

- [ ] **Step 2: Commit all migrations**

```bash
git add supabase/ types/
git commit -m "feat: complete database schema with RLS, PostGIS, triggers, and storage policies"
```

**Dependencies:** Phase 0 (project must exist)
**Expected Outcome:** All tables, RLS policies, triggers, indexes deployed to Supabase. Generated types available.
**Acceptance Criteria:**

- `supabase db push` applies all migrations without errors
- RLS enabled on every table
- `types/database.types.ts` generated and compiles
- Test: run a quick INSERT/RLS verification via Supabase JS client

---

## Phase 2: Core Infrastructure — Supabase Clients, Error Handling, Rate Limiting, Idempotency

**Goal:** Working Supabase client/server helpers, Next.js 16 proxy.ts for session refresh, complete error handling system (AppError + boundary handlers + i18n), reusable rate limiting wrapper (withRateLimit), and idempotency wrapper (withIdempotency). These 4 systems form the foundation every subsequent phase depends on.

**Scope:** `lib/supabase/`, `lib/errors/`, `lib/ratelimit/`, `lib/idempotency/`, `app/proxy.ts`, CSP nonce generation, i18n message files for errors.

### Tasks

#### Task 2.1: Browser Client

**Files:**

- Create: `lib/supabase/client.ts`

```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
```

#### Task 2.2: Server Client

**Files:**

- Create: `lib/supabase/server.ts`

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.types'

export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    },
  )
}
```

#### Task 2.3: Admin Client (Service Role)

**Files:**

- Create: `lib/supabase/admin.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export const createAdminClient = () =>
  createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
```

#### Task 2.4: Proxy Helper & proxy.ts

**Files:**

- Create: `lib/supabase/proxy.ts` (updateSession helper)
- Create: `app/proxy.ts` (Next.js 16 middleware → proxy.ts)

Implement session refresh via `getClaims()` with CSP nonce generation. Write CSP headers with per-request nonce.

#### Task 2.5: Email Hash Helper

**Files:**

- Create: `lib/crypto/email-hash.ts`

```typescript
import { createHash } from 'node:crypto'

export function hashBlockedEmail(email: string): Buffer {
  const pepper = process.env.BLOCKED_EMAIL_PEPPER
  if (!pepper) throw new Error('BLOCKED_EMAIL_PEPPER missing')
  return createHash('sha256')
    .update(pepper + email.trim().toLowerCase())
    .digest()
}
```

#### Task 2.6: Error Handling — Types, Registry & AppError

**Files:**

- Create: `lib/errors/types.ts`
- Create: `lib/errors/registry.ts`
- Create: `lib/errors/app-error.ts`
- Test: `tests/unit/lib/errors/registry.test.ts`
- Test: `tests/unit/lib/errors/app-error.test.ts`
- Design doc: `docs/09-error-handling.md`

- [ ] **Step 1: Write ErrorResponse type, STATUS_MAP (53 error codes), and AppError class**

Implement exactly as specified in `docs/09-error-handling.md`:

- `lib/errors/types.ts` — `ErrorResponse` interface (code, message, details?, trace_id, status)
- `lib/errors/registry.ts` — `STATUS_MAP` with all 53 error codes mapped to HTTP statuses, `ErrorCode` type
- `lib/errors/app-error.ts` — `AppError` class extending Error with `code`, `status`, `traceId`, `details`, `cause`, `logContext`, `toResponse()` method

- [ ] **Step 2: Write registry test**

```typescript
// tests/unit/lib/errors/registry.test.ts
import { describe, it, expect } from 'vitest'
import { STATUS_MAP } from '@/lib/errors/registry'

describe('error code registry', () => {
  const validStatuses = [401, 403, 404, 409, 422, 429, 500, 502, 503, 504]

  it('should have valid HTTP status for every code', () => {
    for (const [code, status] of Object.entries(STATUS_MAP)) {
      expect(validStatuses).toContain(status, `Invalid status ${status} for ${code}`)
    }
  })

  it('should have at least 50 error codes', () => {
    expect(Object.keys(STATUS_MAP).length).toBeGreaterThanOrEqual(50)
  })
})
```

- [ ] **Step 3: Write AppError test**

```typescript
// tests/unit/lib/errors/app-error.test.ts
import { describe, it, expect } from 'vitest'
import { AppError } from '@/lib/errors/app-error'

describe('AppError', () => {
  it('should create error with correct status and traceId', () => {
    const err = new AppError('AUTH_UNAUTHORIZED')
    expect(err.code).toBe('AUTH_UNAUTHORIZED')
    expect(err.status).toBe(401)
    expect(err.traceId).toBeDefined()
  })

  it('should serialize to ErrorResponse without internal data', () => {
    const err = new AppError('LIKE_LIMIT_REACHED', {
      logContext: { userId: 'abc', likesUsed: 3 },
      cause: new Error('DB timeout'),
    })
    const res = err.toResponse()
    expect(res.code).toBe('LIKE_LIMIT_REACHED')
    expect(res.status).toBe(409)
    expect(res).not.toHaveProperty('logContext')
    expect(res).not.toHaveProperty('cause')
  })
})
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
pnpm test --run tests/unit/lib/errors/
```

#### Task 2.7: Error Handling — Boundary Handlers, Validation & Logger

**Files:**

- Create: `lib/errors/handler.ts`
- Create: `lib/errors/action.ts`
- Create: `lib/errors/validation.ts`
- Create: `lib/errors/logger.ts`
- Test: `tests/unit/lib/errors/handler.test.ts`

- [ ] **Step 1: Write handleRouteError, handleActionError, validationError, logError**

Implement exactly as specified in `docs/09-error-handling.md` lines 367-425 (boundary handlers) and lines 585-626 (logger):

- `handleRouteError(error)` — catches AppError → NextResponse JSON, wraps unknown → SYSTEM_INTERNAL_ERROR
- `handleActionError(error)` — same but returns `{ success: false, error: ErrorResponse }` discriminated union
- `validationError(zodError)` — extracts per-field errors from ZodError → AppError with details map
- `logError(error)` — structured JSON to console; Sentry.captureException only for 5xx errors

- [ ] **Step 2: Write handler tests**

```typescript
// tests/unit/lib/errors/handler.test.ts
import { describe, it, expect } from 'vitest'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'

describe('handleRouteError', () => {
  it('should return ErrorResponse for AppError', async () => {
    const err = new AppError('AUTH_UNAUTHORIZED')
    const res = handleRouteError(err)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('AUTH_UNAUTHORIZED')
    expect(body.trace_id).toBeDefined()
  })

  it('should wrap unknown errors as SYSTEM_INTERNAL_ERROR', async () => {
    const res = handleRouteError(new Error('boom'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('SYSTEM_INTERNAL_ERROR')
  })
})
```

#### Task 2.8: Error Handling — Client Utilities & i18n Messages

**Files:**

- Create: `lib/errors/client.ts`
- Create: `lib/errors/messages.ts`
- Modify: `messages/ru.json` (add errors namespace with all 53 codes)
- Modify: `messages/en.json` (add errors namespace with all 53 codes)
- Test: `tests/unit/lib/errors/messages.test.ts`

- [ ] **Step 1: Write parseApiError client helper**

```typescript
// lib/errors/client.ts
import type { ErrorResponse } from './types'

export async function parseApiError(response: Response): Promise<ErrorResponse> {
  try {
    const body = await response.json()
    if (body && typeof body.code === 'string') return body as ErrorResponse
  } catch {
    /* not JSON */
  }
  return {
    code: 'SYSTEM_INTERNAL_ERROR',
    message: 'Что-то пошло не так. Попробуйте позже.',
    trace_id: 'unknown',
    status: response.status,
  }
}
```

- [ ] **Step 2: Add error i18n messages to messages/ru.json and messages/en.json**

Copy all error code translations from `docs/09-error-handling.md` lines 668-733. Every code in STATUS_MAP must have both RU and EN entries under the `"errors"` key.

- [ ] **Step 3: Write CI enforcement test**

```typescript
// tests/unit/lib/errors/messages.test.ts
import { describe, it, expect } from 'vitest'
import { STATUS_MAP } from '@/lib/errors/registry'
import ruMessages from '@/messages/ru.json'
import enMessages from '@/messages/en.json'

describe('error i18n coverage', () => {
  it('should have RU and EN translation for every error code', () => {
    for (const code of Object.keys(STATUS_MAP)) {
      expect(ruMessages.errors).toHaveProperty(code, `Missing RU: ${code}`)
      expect(enMessages.errors).toHaveProperty(code, `Missing EN: ${code}`)
    }
  })

  it('should not have orphaned translations without registry entry', () => {
    for (const key of Object.keys(ruMessages.errors)) {
      expect(STATUS_MAP).toHaveProperty(key, `Orphan RU key: ${key}`)
    }
  })
})
```

#### Task 2.9: Rate Limiting — Client, Keys & Types

**Files:**

- Create: `lib/ratelimit/types.ts`
- Create: `lib/ratelimit/client.ts`
- Create: `lib/ratelimit/keys.ts`
- Design doc: `docs/10-rate-limiting.md`

- [ ] **Step 1: Write types and Upstash client**

Implement exactly as specified in `docs/10-rate-limiting.md`:

- `lib/ratelimit/types.ts` — `RateLimitOptions` interface (limit, window, keyStrategy, errorCode?, bypassRoles?)
- `lib/ratelimit/client.ts` — Upstash Redis + `@upstash/ratelimit` sliding window instance, 3s timeout, `enableAutoPipelining: true`
- `lib/ratelimit/keys.ts` — `resolveKeys()` with IP extraction (cf-connecting-ip → x-forwarded-for → x-real-ip), SHA-256 hashing, path normalization (UUID → :id), `x-user-id` header reading

#### Task 2.10: Rate Limiting — Wrapper & Presets

**Files:**

- Create: `lib/ratelimit/with-rate-limit.ts`
- Create: `lib/ratelimit/presets.ts`
- Create: `lib/ratelimit/headers.ts`
- Test: `tests/unit/lib/ratelimit/with-rate-limit.test.ts`

- [ ] **Step 1: Write withRateLimit wrapper**

Implement as specified in `docs/10-rate-limiting.md` lines 53-96. Key behaviors:

- Role bypass: reads `x-user-role` header, skips rate limit for `['admin', 'moderator']`
- On limit exceeded: throws `AppError` with configured `errorCode`
- On Redis failure: logs warning, fails open (calls handler without limiting)

- [ ] **Step 2: Write 6 presets**

```typescript
// lib/ratelimit/presets.ts
export const AUTH_STRICT: RateLimitOptions = {
  limit: 10,
  window: 60,
  keyStrategy: 'ip',
  errorCode: 'RATE_LIMIT_AUTH_CALLBACK',
  bypassRoles: [],
}
export const ACTION_MODERATE: RateLimitOptions = {
  limit: 30,
  window: 60,
  keyStrategy: 'user',
}
export const MESSAGE_SEND: RateLimitOptions = {
  limit: 30,
  window: 60,
  keyStrategy: 'user',
  errorCode: 'RATE_LIMIT_MESSAGE_SEND',
}
export const READ_GENEROUS: RateLimitOptions = {
  limit: 120,
  window: 60,
  keyStrategy: 'ip+user',
}
export const PHOTO_UPLOAD: RateLimitOptions = {
  limit: 20,
  window: 60,
  keyStrategy: 'user',
}
export const WEBHOOK: RateLimitOptions = {
  limit: 300,
  window: 60,
  keyStrategy: 'ip',
}
```

- [ ] **Step 3: Write response headers helper and tests**

```typescript
// lib/ratelimit/headers.ts
export function setRateLimitHeaders(
  response: NextResponse,
  limit: number,
  remaining: number,
  reset: number,
): void {
  response.headers.set('X-RateLimit-Limit', String(limit))
  response.headers.set('X-RateLimit-Remaining', String(remaining))
  response.headers.set('X-RateLimit-Reset', String(reset))
}
```

```typescript
// tests/unit/lib/ratelimit/with-rate-limit.test.ts
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { AUTH_STRICT } from '@/lib/ratelimit/presets'

describe('withRateLimit', () => {
  it('should bypass rate limit for admin role', async () => {
    const handler = vi.fn().mockResolvedValue(new Response('ok'))
    const wrapped = withRateLimit(handler, AUTH_STRICT)
    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-user-role': 'admin' },
    })
    await wrapped(req, {})
    expect(handler).toHaveBeenCalled()
  })
})
```

#### Task 2.11: Idempotency — Keys, Redis & Lock Acquisition

**Files:**

- Create: `lib/idempotency/types.ts`
- Create: `lib/idempotency/keys.ts`
- Create: `lib/idempotency/redis.ts`
- Create: `lib/idempotency/headers.ts`
- Design doc: `docs/11-idempotency.md`

- [ ] **Step 1: Write types, key resolver, Redis operations, and header filter**

Implement exactly as specified in `docs/11-idempotency.md`:

- `lib/idempotency/types.ts` — `IdempotencyOptions` (required?, ttl?, timeout?), `StoredResponse`
- `lib/idempotency/keys.ts` — `resolveIdempotencyKey()` with UUID v4 regex validation, user-scoped keys (`idempotency:user:{userId}:{uuid}`), IP fallback for unauthenticated
- `lib/idempotency/redis.ts` — `acquireLock()` (atomic SETNX + EXPIRE via Redis Lua script — see docs/11-idempotency.md lines 164-180 for the exact script), `storeResult()`, `waitForResult()` (50ms polling), `releaseLock()` (guarded: only deletes if value is still "pending")
- `lib/idempotency/headers.ts` — `filterHeaders()` allowlisting only content-type, cache-control, x-ratelimit-\*

**Note on Redis Lua scripts:** The `acquireLock` and `releaseLock` functions use Redis's server-side scripting (the `EVAL` command) for atomicity. Full Lua script source is in `docs/11-idempotency.md`. These are NOT JavaScript `eval()` — they execute on the Redis server, not in Node.js.

#### Task 2.12: Idempotency — Wrapper, Presets & Client Helper

**Files:**

- Create: `lib/idempotency/with-idempotency.ts`
- Create: `lib/idempotency/presets.ts`
- Create: `lib/idempotency/client.ts`
- Test: `tests/unit/lib/idempotency/keys.test.ts`

- [ ] **Step 1: Write withIdempotency wrapper**

Implement as specified in `docs/11-idempotency.md` lines 43-119. Key behaviors:

- No key + not required → pass through without idempotency
- No key + required → throw `IDEMPOTENCY_KEY_MISSING`
- Lock acquired → execute handler, store 2xx results, release lock on 4xx/5xx
- Lock not acquired → poll for result (50ms intervals), replay cached response, timeout → 409
- Redis failure → fail open, proceed without idempotency

- [ ] **Step 2: Write 3 presets and client helper**

```typescript
// lib/idempotency/presets.ts
export const PAYMENT_CRITICAL: IdempotencyOptions = {
  required: true,
  ttl: 86_400,
  timeout: 60_000,
}
export const USER_ACTION: IdempotencyOptions = {
  required: false,
  ttl: 3600,
  timeout: 10_000,
}
export const MESSAGE_SEND: IdempotencyOptions = {
  required: false,
  ttl: 600,
  timeout: 5_000,
}

// lib/idempotency/client.ts
export function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}
```

- [ ] **Step 3: Write key validation tests**

```typescript
// tests/unit/lib/idempotency/keys.test.ts
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { resolveIdempotencyKey } from '@/lib/idempotency/keys'

describe('resolveIdempotencyKey', () => {
  it('should accept valid UUID v4', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-user-id': 'user-123' },
    })
    const key = await resolveIdempotencyKey(req, '550e8400-e29b-41d4-a716-446655440000')
    expect(key).toContain('idempotency:user:user-123:')
  })

  it('should reject invalid format', async () => {
    const req = new NextRequest('http://localhost/api/test')
    await expect(resolveIdempotencyKey(req, 'not-a-uuid')).rejects.toThrow(
      'IDEMPOTENCY_KEY_INVALID',
    )
  })
})
```

#### Task 2.13: Wire Infrastructure into proxy.ts

**Files:**

- Modify: `app/proxy.ts` (add x-user-id, x-user-role headers; add suspension check with error redirect)

- [ ] **Step 1: Set user headers after session refresh**

After `getClaims()` in proxy.ts, set headers consumed by rate limiting, idempotency, and all downstream handlers:

```typescript
const claims = await supabase.auth.getClaims()
if (claims) {
  requestHeaders.set('x-user-id', claims.sub)
  requestHeaders.set('x-user-role', claims.role ?? 'user')
}
```

- [ ] **Step 2: Add suspension check with AppError-compatible redirect**

```typescript
if (claims) {
  const { data: suspended } = await supabase.rpc('is_user_suspended', { p_user: claims.sub })
  if (suspended) {
    await supabase.auth.signOut()
    url.pathname = '/blocked'
    return NextResponse.redirect(url)
  }
}
```

**Dependencies:** Phase 1 (database must exist, env vars set, Upstash Redis provisioned)
**Expected Outcome:** All 4 infrastructure systems (Supabase clients, error handling, rate limiting, idempotency) are complete, tested, and ready for feature development. proxy.ts refreshes sessions, sets user headers, and enforces suspensions.
**Acceptance Criteria:**

- `createClient()` works in browser components
- `createServerSupabase()` works in RSC/Route Handlers
- `createAdminClient()` works with service role bypass
- proxy.ts refreshes sessions, generates CSP nonce, sets `x-user-id` and `x-user-role` headers
- `AppError` thrown anywhere produces a standardized JSON response via `handleRouteError`
- `withRateLimit()` wraps any Route Handler and returns 429 when limit exceeded
- `withIdempotency()` prevents duplicate mutation execution for the same key
- Redis failure does not block requests (fail-open verified)
- All 53 error codes have RU + EN translations
- CI test enforces every error code has translations in both locales
- Unit tests for: AppError, error registry, handleRouteError, rate limit keys, idempotency keys

---

## Phase 3: Authentication & Onboarding (Steps 1-2)

**Goal:** Working Magic Link auth flow, registration, and first 2 onboarding steps (basic + extended data).

**Scope:** Auth page, callback Route Handler, registration trigger, onboarding steps 1-2 UI + Server Actions + Zod schemas.

### Tasks

#### Task 3.1: Auth Page & Magic Link Flow

**Files:**

- Create: `app/(public)/auth/page.tsx`
- Create: `app/(public)/layout.tsx`
- Create: `features/auth/schemas.ts`
- Create: `features/auth/actions.ts`
- Create: `features/auth/server/send-magic-link.ts`
- Create: `features/auth/components/AuthForm.tsx`

- [ ] **Step 1: Write Zod schema for email input**

```typescript
// features/auth/schemas.ts
import { z } from 'zod'

export const authEmailSchema = z.object({
  email: z.email({ error: 'Введите корректный email' }),
})
```

- [ ] **Step 2: Write send-magic-link helper**

```typescript
// features/auth/server/send-magic-link.ts
export async function sendMagicLink(email: string) {
  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.SUPABASE_URL}/api/auth/callback` },
  })
  if (error) throw error
}
```

- [ ] **Step 3: Write Server Action**

```typescript
// features/auth/actions.ts
'use server'
export async function requestMagicLink(formData: FormData) { ... }
```

- [ ] **Step 4: Write Auth page with form and success state**

- [ ] **Step 5: Write Auth layout (public routes)**

```tsx
// app/(public)/layout.tsx
export default function PublicLayout({ children }) {
  return <main className="min-h-screen flex items-center justify-center">{children}</main>
}
```

#### Task 3.2: Auth Callback Route Handler

**Files:**

- Create: `app/api/auth/callback/route.ts`

Implement the full callback: exchange code for session, redirect to `/onboarding` if `onboarding_completed = false`, else `/feed`. Handle errors (redirect to `/auth?error=auth_callback_failed`). Include `handle_new_user()` trigger handling + block rebind logic (peppered hash).

#### Task 3.3: Root Layout & Route Groups

**Files:**

- Create: `app/layout.tsx` (root layout with HTML, body, providers)
- Create: `app/(app)/layout.tsx` (authenticated layout with AppBar/Sidebar)
- Create: `app/(app)/feed/page.tsx` (placeholder)
- Create: `app/globals.css` (Tailwind v4)

#### Task 3.4: Onboarding Step 1 — Basic Data

**Files:**

- Create: `app/(app)/onboarding/page.tsx` (wizard container)
- Create: `features/profile/schemas.ts` (Zod schema for step 1 fields)
- Create: `features/profile/actions.ts` (saveStep1 Server Action)
- Create: `features/profile/server/save-basic-data.ts` (business logic)
- Create: `features/profile/components/OnboardingStep1.tsx`

Implement form with: name, DOB (≥18 validation), gender (icon cards), country (combobox from geonames), city (autocomplete), nationality, height, weight, geolocation consent checkbox.

- [ ] **Step 1: Write Zod schema for step 1**

```typescript
export const onboardingStep1Schema = z.object({
  name: z.string().min(2, { error: 'Минимум 2 символа' }).max(50),
  birth_date: z.string().refine(
    (val) => {
      const date = new Date(val)
      const eighteenYearsAgo = new Date()
      eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18)
      return date <= eighteenYearsAgo
    },
    { error: 'Вам должно быть не менее 18 лет' },
  ),
  gender: z.enum(['male', 'female']),
  country: z.string().min(1),
  city: z.string().min(1),
  nationality: z.string().min(1),
  height: z.number().int().min(100).max(250),
  weight: z.number().int().min(30).max(300),
  allow_geolocation: z.boolean(),
})
```

- [ ] **Step 2: Write save-basic-data helper**

```typescript
// features/profile/server/save-basic-data.ts
import { createServerSupabase } from '@/lib/supabase/server'

export async function saveBasicData(userId: string, data: OnboardingStep1Data) {
  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('profiles')
    .update({
      name: data.name,
      birth_date: data.birth_date,
      gender: data.gender,
      country: data.country,
      city: data.city,
      nationality: data.nationality,
      height: data.height,
      weight: data.weight,
      location: data.allow_geolocation ? `POINT(${data.lng} ${data.lat})` : null,
    })
    .eq('id', userId)
  if (error) throw error
}
```

- [ ] **Step 3: Write Server Action (thin wrapper)**

```typescript
// features/profile/actions.ts
'use server'
import { onboardingStep1Schema } from './schemas'
import { saveBasicData } from './server/save-basic-data'
import { getClaims } from '@/lib/supabase/server'

export async function saveOnboardingStep1(formData: FormData) {
  const user = await getClaims()
  if (!user) throw new Error('Unauthorized')
  const raw = Object.fromEntries(formData)
  const parsed = onboardingStep1Schema.safeParse(raw)
  if (!parsed.success) return { errors: parsed.error.flatten() }
  await saveBasicData(user.sub, parsed.data)
  revalidatePath('/onboarding')
}
```

- [ ] **Step 4: Write OnboardingStep1 component** with all form fields, client-side Zod validation via `react-hook-form` + `@hookform/resolvers/zod`, auto-save on debounced changes.

#### Task 3.5: Onboarding Step 2 — Extended Data

**Files:**

- Create: `features/profile/schemas.ts` (add step 2 schemas — male and female variants)
- Create: `features/profile/server/save-extended-data.ts`
- Create: `features/profile/components/OnboardingStep2.tsx`

Implement gender-conditional form with all fields from the spec. Men: marital status (including polygyny options), children, education, income, housing, about_self. Women: marital status, children, education, relocation willingness, polygyny attitude, hijab attitude, about_self.

#### Task 3.6: Geo Autocomplete API

**Files:**

- Create: `app/api/geo/cities/route.ts`
- Create: `features/geo/schemas.ts`

Route Handler that queries `geonames_cities` with country filter + search query using `ILIKE` and `pg_trgm` similarity.

#### Task 3.7: Write Tests for Auth & Onboarding

**Files:**

- Create: `tests/unit/features/auth/send-magic-link.test.ts`
- Create: `tests/unit/features/profile/onboarding-schemas.test.ts`
- Create: `tests/integration/features/auth/callback.test.ts`

- [ ] **Step 1: Unit test for email schema validation**

```typescript
// tests/unit/features/auth/send-magic-link.test.ts
import { describe, it, expect } from 'vitest'
import { authEmailSchema } from '@/features/auth/schemas'

describe('authEmailSchema', () => {
  it('should accept valid email', () => {
    expect(authEmailSchema.safeParse({ email: 'test@example.com' }).success).toBe(true)
  })

  it('should reject invalid email', () => {
    expect(authEmailSchema.safeParse({ email: 'not-email' }).success).toBe(false)
  })

  it('should reject empty email', () => {
    expect(authEmailSchema.safeParse({ email: '' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Unit test for onboarding step 1 schema** — test all field validations, DOB ≥ 18 boundary, gender enum.

- [ ] **Step 3: Unit test for onboarding step 2 schema** — test male variant, female variant, gender-conditional validations.

**Dependencies:** Phase 2 (Supabase clients, error handling, rate limiting, idempotency, proxy.ts working)
**Expected Outcome:** Users can sign up via Magic Link, be redirected to onboarding, complete steps 1-2 with auto-save. Sessions are refreshed correctly.
**Acceptance Criteria:**

- Auth flow: email → Magic Link → callback → onboarding redirect
- Onboarding step 1 saves all basic fields correctly to DB
- Onboarding step 2 saves gender-conditional fields
- Date of birth rejects <18 years old on both client and server
- Geo autocomplete returns city suggestions
- All tests pass

---

## Phase 4: Onboarding Steps 3-4 & AI Bio

**Goal:** Complete onboarding with photo upload (step 3) and AI bio generation (step 4).

**Scope:** Photo upload via signed URLs, photo grid UI, review step, OpenAI bio generation, Inngest integration setup.

### Tasks

#### Task 4.1: Inngest Setup

**Files:**

- Create: `lib/inngest/client.ts`
- Create: `app/api/webhooks/inngest/route.ts`

```typescript
// lib/inngest/client.ts
import { Inngest } from 'inngest'

export const inngest = new Inngest({ id: 'nikah-help' })
```

Serve Inngest functions from the Route Handler.

#### Task 4.2: Photo Upload Flow (Onboarding Step 3)

**Files:**

- Create: `app/api/photos/upload-url/route.ts`
- Create: `features/profile/components/OnboardingStep3.tsx`
- Create: `features/profile/actions.ts` (add photo actions)

Implement: signed URL generation, direct upload to Supabase Storage, `markPhotoUploaded` Server Action, photo grid (up to 6, 4:5 ratio, first = avatar), private mode toggle.

#### Task 4.3: OpenAI Client

**Files:**

- Create: `lib/openai/client.ts`

```typescript
import OpenAI from 'openai'

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export const AI_BIO_PROMPT = `You are an assistant for a Muslim marriage application...` // Full canonical prompt from 01-auth.md
```

#### Task 4.4: Onboarding Step 4 — Review & Bio Generation

**Files:**

- Create: `features/profile/components/OnboardingStep4.tsx`
- Create: `features/profile/server/generate-bio.ts`
- Create: `features/profile/server/complete-onboarding.ts`

Review step shows all data read-only. "Save" triggers bio generation via OpenAI, sets `onboarding_completed = true`, redirects to `/feed`.

#### Task 4.5: Inngest Bio Regeneration Function

**Files:**

- Create: `lib/inngest/functions/profile-regenerate-bio.ts`

```typescript
export const profileRegenerateBioFn = inngest.createFunction(
  {
    id: 'profile.regenerate-bio',
    retries: 3,
    concurrency: { limit: 50, key: 'event.data.userId' },
    rateLimit: { limit: 3, period: '24h', key: 'event.data.userId' },
  },
  { event: 'profile/regenerate-bio' },
  async ({ event, step }) => {
    const { userId } = event.data
    const profile = await step.run('load-profile', () => loadProfile(userId))
    const bio = await step.run('openai-generate', () =>
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: AI_BIO_PROMPT },
          { role: 'user', content: JSON.stringify(profile.bioInputs) },
        ],
      }),
    )
    await step.run('persist', () => updateAiBio(userId, bio))
  },
)
```

#### Task 4.6: Write Tests

**Files:**

- Create: `tests/unit/features/profile/ai-bio.test.ts`
- Create: `tests/integration/api/photos/upload-url.test.ts`
- Create: `tests/e2e/onboarding.spec.ts`

**Dependencies:** Phase 3 (onboarding steps 1-2 working)
**Expected Outcome:** Users complete onboarding, bio is generated, redirected to feed. Photos uploaded and displayed.
**Acceptance Criteria:**

- Photo upload via signed URL works end-to-end
- Photo grid shows up to 6 photos, first = avatar
- OpenAI bio generation succeeds with valid profile data
- Inngest function registered and invocable
- Onboarding step 4 sets `onboarding_completed = true`
- All tests pass

---

## Phase 5: Image Processing Pipeline & Photo Delivery

**Goal:** Complete photo processing (sharp variants), privacy-first proxy delivery, moderation pipeline.

**Scope:** `/api/photos/process` (10 variants), `/api/photos/stream` (blur-enforcing proxy), Inngest moderation, photo CRUD, Storage RLS.

### Tasks

#### Task 5.0: Photo Variant Configuration (Shared Config)

**Files:**

- Create: `lib/image-processing/photo-variants.ts`
- Test: `tests/unit/lib/image-processing/photo-variants.test.ts`
- Design doc: `docs/13-photo-variants.md`

- [ ] **Step 1: Write the shared photo variants config**

Implement exactly as specified in `docs/13-photo-variants.md`. This file is the single source of truth for ALL photo dimensions, formats, compression, upload constraints, and storage paths. Key exports:

- `PHOTO_VARIANTS` — 5 variants (avatar 100×100, cover 400×500, cover_blurred σ=40, full ≤1200×1500, full_blurred σ=60), each with width, height, aspectRatio, fit, blur, cacheControl, generateBlurred, fileSuffix, jsonbKey, publicName
- `COMPRESSION` — `{ avif: { quality: 60 }, webp: { quality: 80 } }`
- `FORMATS` — `['avif', 'webp']` as const
- `UPLOAD` — maxFileSize (10MB), minShortSide (1000px), acceptedMimeTypes, maxPhotosPerProfile (6)
- `STORAGE` — bucket name, path patterns
- `PROCESSING` — maxDuration (30s), withoutEnlargement (true)
- Helper functions: `resolveServeVariant()`, `getBlurredVariant()`, `buildStoragePath()`, `buildVariantsJsonb()`

- [ ] **Step 2: Write config consistency tests**

```typescript
// tests/unit/lib/image-processing/photo-variants.test.ts
import { describe, it, expect } from 'vitest'
import {
  PHOTO_VARIANTS,
  resolveServeVariant,
  getBlurredVariant,
  PUBLIC_VARIANTS,
} from '@/lib/image-processing/photo-variants'

describe('photo variant config', () => {
  it('should have exactly 5 variants', () => {
    expect(Object.keys(PHOTO_VARIANTS)).toHaveLength(5)
  })

  it('should have 3 public variants', () => {
    expect(PUBLIC_VARIANTS).toEqual(['avatar', 'cover', 'full'])
  })

  it('should never blur the avatar', () => {
    expect(PHOTO_VARIANTS.avatar.generateBlurred).toBe(false)
    expect(getBlurredVariant('avatar')).toBeNull()
  })

  it('should blur cover and full when showFull is false', () => {
    expect(resolveServeVariant('cover', false).jsonbKey).toBe('cover_blurred')
    expect(resolveServeVariant('full', false).jsonbKey).toBe('full_blurred')
    expect(resolveServeVariant('avatar', false).jsonbKey).toBe('avatar')
  })

  it('should serve unblurred when showFull is true', () => {
    expect(resolveServeVariant('cover', true).jsonbKey).toBe('cover')
    expect(resolveServeVariant('full', true).jsonbKey).toBe('full')
  })

  it('should have valid aspect ratios matching dimensions', () => {
    for (const variant of Object.values(PHOTO_VARIANTS)) {
      const { w, h } = variant.aspectRatio
      expect(variant.width / variant.height).toBeCloseTo(w / h, 1)
    }
  })
})
```

#### Task 5.1: sharp Processing Pipeline

**Files:**

- Create: `lib/image-processing/pipeline.ts`
- Create: `lib/image-processing/validate-upload.ts`

Implement `processImage(buffer, userId, photoId)` by iterating `PHOTO_VARIANTS` and `FORMATS` from the shared config. No dimensions or quality values are hardcoded — everything comes from `photo-variants.ts`. Adding a new variant to the config automatically includes it in generation.

Also implement `validateUpload(buffer)` that checks file size, MIME type, and minimum resolution against `UPLOAD` constants.

#### Task 5.2: Process Route Handler

**Files:**

- Create: `app/api/photos/process/route.ts`

```typescript
export const runtime = 'nodejs'
export const maxDuration = 30
```

Downloads original from Storage, runs sharp pipeline, uploads all 10 variants via service role, deletes original, updates `photos` row. Idempotent.

#### Task 5.3: Photo Stream Route Handler

**Files:**

- Create: `app/api/photos/stream/route.ts`

Implement: authenticate viewer, validate params (`variant` must be one of `PUBLIC_VARIANTS`, `fmt` must be `avif` or `webp`), apply rate limit via `withRateLimit(handler, READ_GENEROUS)`, determine authorization (blur decision from `get_photo_stream_context` Postgres function), resolve actual variant via `resolveServeVariant(publicVariant, showFull)`, read storage path from `photos.variants[variant.jsonbKey][fmt]`, download from Storage via service role, return bytes with headers from variant config (`variant.cacheControl`, `Content-Type: image/{fmt}`).

#### Task 5.4: Inngest Photo Moderation

**Files:**

- Create: `lib/inngest/functions/photo-moderate.ts`

OpenAI Vision moderation: download cover variant, call gpt-4o, evaluate structured output against thresholds, update `photos.moderation_status`.

#### Task 5.5: Photo CRUD Server Actions

**Files:**

- Create: `features/profile/actions.ts` (add replacePhoto, deletePhoto, reorderPhotos)
- Create: `features/profile/server/replace-photo.ts`
- Create: `features/profile/server/delete-photo.ts`
- Create: `features/profile/server/reorder-photos.ts`

Implement replace (with cleanup via Inngest), delete (with avatar promotion logic), reorder (single UPDATE statement).

#### Task 5.6: Database Webhook for Moderation

**Files:**

- Create: Supabase Database Webhook config (via dashboard or migration)

Configure webhook: `photos.status = 'processed'` → `POST /api/webhooks/inngest` with event `photo/moderate`.

#### Task 5.7: Cleanup Inngest Functions

**Files:**

- Create: `lib/inngest/functions/photo-replace-cleanup.ts`
- Create: `lib/inngest/functions/photo-abandon-cleanup.ts`
- Create: `lib/inngest/functions/photo-delete.ts`

#### Task 5.8: Photo Component (Picture Element)

**Files:**

- Create: `features/photos/components/Photo.tsx`

```tsx
import {
  PHOTO_VARIANTS,
  resolveServeVariant,
  type PublicVariant,
} from '@/lib/image-processing/photo-variants'

interface PhotoProps {
  photoId: string
  variant?: PublicVariant // default: 'cover'
  blurred?: boolean // default: false
  alt: string
  className?: string
  protected?: boolean // default: true — prevents right-click save
}

export function Photo({
  photoId,
  variant = 'cover',
  blurred = false,
  alt,
  className,
  protected = true,
}: PhotoProps) {
  const config = PHOTO_VARIANTS[variant]
  const serveVariant = blurred
    ? resolveServeVariant(variant, false)
    : resolveServeVariant(variant, true)

  const avifSrc = `/api/photos/stream?photoId=${photoId}&variant=${variant}&fmt=avif`
  const webpSrc = `/api/photos/stream?photoId=${photoId}&variant=${variant}&fmt=webp`

  return (
    <picture>
      <source srcSet={avifSrc} type="image/avif" />
      <source srcSet={webpSrc} type="image/webp" />
      <img
        src={webpSrc}
        alt={alt}
        width={config.width}
        height={config.height}
        className={className}
        loading="lazy"
        decoding="async"
        draggable={false}
        onContextMenu={protected ? (e) => e.preventDefault() : undefined}
        style={{ aspectRatio: `${config.aspectRatio.w}/${config.aspectRatio.h}` }}
      />
    </picture>
  )
}
```

All dimensions (`width`, `height`, `aspectRatio`) come from the shared config. No hardcoded pixel values.

#### Task 5.9: Write Tests

**Files:**

- Create: `tests/unit/lib/image-processing/pipeline.test.ts`
- Create: `tests/integration/api/photos/stream.test.ts`
- Create: `tests/integration/api/photos/process.test.ts`

- [ ] **Step 1: Test sharp pipeline using shared config**

```typescript
// tests/unit/lib/image-processing/pipeline.test.ts
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { PHOTO_VARIANTS, FORMATS } from '@/lib/image-processing/photo-variants'
import { processImage } from '@/lib/image-processing/pipeline'

describe('processImage', () => {
  const userId = '00000000-0000-0000-0000-000000000001'
  const photoId = '00000000-0000-0000-0000-000000000002'

  it('should produce exactly N files (variants × formats)', async () => {
    const testImage = await sharp({
      create: { width: 2000, height: 2500, channels: 3, background: '#4488cc' },
    })
      .jpeg()
      .toBuffer()

    const result = await processImage(testImage, userId, photoId)
    expect(result.files).toHaveLength(Object.keys(PHOTO_VARIANTS).length * FORMATS.length)
  })

  it('should produce avatar at configured dimensions', async () => {
    const testImage = await sharp({
      create: { width: 2000, height: 2500, channels: 3, background: '#4488cc' },
    })
      .jpeg()
      .toBuffer()

    const result = await processImage(testImage, userId, photoId)

    for (const format of FORMATS) {
      const file = result.files.find(
        (f) => f.path.includes('-avatar') && f.path.endsWith(`.${format}`),
      )
      expect(file).toBeDefined()
      const meta = await sharp(file!.buffer).metadata()
      expect(meta.width).toBe(PHOTO_VARIANTS.avatar.width)
      expect(meta.height).toBe(PHOTO_VARIANTS.avatar.height)
    }
  })

  it('should never upscale (withoutEnlargement)', async () => {
    const smallImage = await sharp({
      create: { width: 200, height: 250, channels: 3, background: '#4488cc' },
    })
      .jpeg()
      .toBuffer()

    const result = await processImage(smallImage, userId, photoId)
    const fullFile = result.files.find(
      (f) => f.path.includes('-full.') && !f.path.includes('blurred'),
    )
    const meta = await sharp(fullFile!.buffer).metadata()
    expect(meta.width!).toBeLessThanOrEqual(200)
    expect(meta.height!).toBeLessThanOrEqual(250)
  })
})
```

- [ ] **Step 2: Test photo stream blur enforcement** — verify blurred variant served when no relationship exists, full variant when mutual match exists. Use `resolveServeVariant()` from config.

**Dependencies:** Phase 4 (onboarding step 3 photos must work, Inngest must be set up)
**Expected Outcome:** Photos are processed into 10 variants, streamed through proxy with correct blur enforcement, moderated automatically.
**Acceptance Criteria:**

- sharp pipeline generates exactly 10 files with correct dimensions
- Photo stream proxy returns correct variant based on blur matrix
- Moderation auto-rejects explicit content
- Photo CRUD works (replace, delete, reorder)
- All tests pass

---

## Phase 6: Feed & Profile System

**Goal:** Working feed with filters, profile detail view, profile editing, publishing controls.

**Scope:** `/feed` with infinite scroll, gender-specific filters, PostGIS radius search, `/profile/[id]`, `/profile/edit`, profile publish/unpublish.

### Tasks

#### Task 6.1: Feed Page (SSR + Realtime)

**Files:**

- Create: `app/(app)/feed/page.tsx` (React Server Component — initial data fetch)
- Create: `features/feed/components/FeedClient.tsx` ('use client' — infinite scroll, Realtime subscription)
- Create: `features/feed/components/ProfileCard.tsx`
- Create: `features/feed/hooks/useFeed.ts`
- Create: `features/feed/server/query-feed.ts` (server-side query helper)

Implement cursor-based pagination, opposite-gender filter, published+approved-photo requirement. Use `useInfiniteQuery` from TanStack Query.

#### Task 6.2: Feed Filters

**Files:**

- Create: `app/(app)/feed/@filters/page.tsx` (parallel route)
- Create: `features/feed/components/FilterPanel.tsx`
- Create: `features/feed/schemas.ts` (filter types, Zod schemas)
- Create: `features/feed/hooks/useFilters.ts`

Gender-specific filter panels. URL query param sync via `useSearchParams` + `router.replace`. Male filters: location, age, marital status, children, polygyny, hijab. Female filters: location, age, marital status, children, income, housing.

#### Task 6.3: PostGIS Radius Search

**Files:**

- Create: `features/feed/server/radius-search.ts`

Implement `ST_DWithin` query against `profiles.location`. Radius slider 50-1000 km (step 50). Only returns users with geolocation enabled. Excludes users without `location`.

#### Task 6.4: Profile Detail View

**Files:**

- Create: `app/(app)/profile/[id]/page.tsx`
- Create: `features/profile/components/ProfileDetail.tsx`
- Create: `features/profile/components/PhotoSlider.tsx`
- Create: `features/profile/server/get-profile.ts`

Show: avatar, name, age, country, AI bio (full text), photos (PhotoSlider, blurred per rules). Action buttons: Like, Block, Report.

#### Task 6.5: Own Profile Page & Edit

**Files:**

- Create: `app/(app)/profile/page.tsx` (own profile redirect to /profile/[own-id])
- Create: `app/(app)/profile/edit/page.tsx`
- Create: `features/profile/components/ProfileEditForm.tsx`

Group into same 4 sections as onboarding. Pre-fill from DB. Gender locked (read-only + tooltip). Save triggers bio regeneration if bio-relevant fields changed.

#### Task 6.6: Profile Publish/Unpublish

**Files:**

- Create: `features/profile/components/PublishToggle.tsx`
- Create: `features/profile/server/toggle-publish.ts`

Toggle with confirmation dialog. On publish: check at least one approved photo. On unpublish: warn about feed visibility.

#### Task 6.7: Write Tests

**Files:**

- Create: `tests/unit/features/feed/filters.test.ts`
- Create: `tests/unit/features/profile/publish.test.ts`
- Create: `tests/integration/features/feed/radius-search.test.ts`
- Create: `tests/e2e/feed.spec.ts`

**Dependencies:** Phase 5 (photos must be processed and deliverable via stream)
**Expected Outcome:** Users browse feed, apply filters, search by radius, view profiles, edit own profile.
**Acceptance Criteria:**

- Feed shows opposite-gender, published profiles with approved photos
- Infinite scroll loads more profiles
- Filters work and persist to URL
- Radius search returns geographically close profiles
- Profile detail shows AI bio and photos with correct blur
- Profile edit saves and triggers bio regeneration when relevant
- Publish toggle enforces "at least one approved photo" rule
- All tests pass

---

## Phase 7: Likes, Matching & Tariff Limits

**Goal:** Working like system with automatic match creation and tariff-based limits.

**Scope:** Like/unlike Server Actions, match creation trigger, match modal, free-tier 3-likes limit, subscription integration point.

### Tasks

#### Task 7.1: Send Like Server Action

**Files:**

- Create: `features/likes/actions.ts`
- Create: `features/likes/server/send-like.ts`
- Create: `features/likes/schemas.ts`

Implement: validate published, opposite gender, not blocked, not self, within tariff limits, idempotency. INSERT into `likes`. Emit notification event.

#### Task 7.2: Revoke Like / Match Cleanup

**Files:**

- Create: `features/likes/server/revoke-like.ts`
- Create: `lib/inngest/functions/like-revoke.ts`

Implement Inngest workflow: DELETE likes, matches, messages (cascade), chat media from Storage. Idempotency key: `revoke:{userA}:{userB}`.

#### Task 7.3: Tariff Limit Enforcement

**Files:**

- Create: `features/likes/server/check-limits.ts`

Single counter: `COUNT(*) FROM likes WHERE from_user_id = $me`. Check `has_active_subscription()` first. If premium → allow. If free-tier male and count < 3 → allow. Else → reject with modal linking to `/subscription`.

#### Task 7.4: Match Modal (Fullscreen)

**Files:**

- Create: `components/layout/MatchModal.tsx`
- Create: `features/likes/hooks/useMatchListener.ts`

Listen for Broadcast event `match.created` on `user:${userId}`. Show fullscreen overlay with two avatars + "Go to Chat" button. For B (who triggered the match): fullscreen modal. For A (who was liked back): toast.

#### Task 7.5: Likes List Pages

**Files:**

- Create: `app/(app)/likes/page.tsx`
- Create: `features/likes/components/LikesTabs.tsx`

Three tabs: "Liked you" (incoming), "You liked" (outgoing), "Matches" (mutual).

#### Task 7.6: Write Tests

**Files:**

- Create: `tests/unit/features/likes/limits.test.ts`
- Create: `tests/integration/features/likes/match-trigger.test.ts`
- Create: `tests/e2e/likes.spec.ts`

- [ ] **Step 1: Test tariff limit enforcement**

```typescript
describe('tariff limits', () => {
  it('should allow female users unlimited likes', () => { ... })
  it('should allow premium male users unlimited likes', () => { ... })
  it('should reject free-tier male after 3 likes', () => { ... })
  it('should not reset count on like revocation', () => { ... })
})
```

- [ ] **Step 2: Test match trigger** — verify that reciprocal like creates `matches` + `chats` row atomically.

- [ ] **Step 3: Test match modal and notification** — verify Broadcast event sends `match.created` to both users.

**Dependencies:** Phase 6 (feed and profiles must be viewable)
**Expected Outcome:** Liking works, matches auto-create with atomic trigger, tariff limits enforced server-side.
**Acceptance Criteria:**

- Like button on profile detail works
- Mutual like → match + chat created automatically
- Free-tier male limited to 3 lifetime likes
- Premium male unlimited
- Female users unlimited
- Match modal shown on mutual like
- Like revocation cleans up match + chat
- All tests pass

---

## Phase 8: Real-time Chat

**Goal:** Fully functional real-time chat with text/image/voice messages, status tracking, and Realtime v2 integration.

**Scope:** Chat list, chat detail, message sending (text/image/voice), Realtime subscriptions, typing indicators, presence, message status, edit/delete, voice playback.

### Tasks

#### Task 8.1: Chat List Page

**Files:**

- Create: `app/(app)/chats/page.tsx`
- Create: `features/chat/components/ChatList.tsx`
- Create: `features/chat/server/get-chats.ts`

List of chats with last message preview, unread count, online indicator. Sort by most recent message.

#### Task 8.2: Chat Detail Layout

**Files:**

- Create: `app/(app)/chats/[chatId]/page.tsx`
- Create: `features/chat/components/ChatDetail.tsx`
- Create: `features/chat/components/MessageList.tsx`
- Create: `features/chat/components/MessageBubble.tsx`
- Create: `features/chat/components/Composer.tsx`

Scroll to bottom (or first unread with "New Messages" divider). Message bubbles with status indicators (✓/✓✓). Composer with send button.

#### Task 8.3: Message Sending

**Files:**

- Create: `features/chat/actions.ts`
- Create: `features/chat/server/send-message.ts`
- Create: `features/chat/schemas.ts`

Text message: validate ≤ 4000 chars, rate limit 30/min via Upstash, INSERT, client optimistically adds to cache. Image: upload to chat-media bucket, insert path. Voice: MediaRecorder, upload, insert path.

#### Task 8.4: Realtime v2 Integration

**Files:**

- Create: `features/chat/hooks/useChatChannel.ts`

Subscribe to `chat:${chatId}` channel. Postgres Changes on `messages` for new messages. Broadcast for typing events. Presence for online status.

#### Task 8.5: Typing Indicators & Presence

**Files:**

- Create: `features/chat/components/TypingIndicator.tsx`
- Create: `features/chat/hooks/useTypingStatus.ts`
- Create: `features/chat/hooks/usePresence.ts`

Throttled Broadcast `typing` / `typing_stop`. Presence tracking on channel join. Display online dot / "last seen" time.

#### Task 8.6: Message Status (delivered/read)

**Files:**

- Create: `features/chat/server/mark-delivered.ts`
- Create: `features/chat/server/mark-as-read.ts`

Client calls `markDelivered` on receiving Realtime INSERT. Intersection Observer triggers `markAsRead` for visible messages. Status transitions: sent → delivered → read (monotonic).

#### Task 8.7: Message Edit & Delete

**Files:**

- Create: `features/chat/server/edit-message.ts`
- Create: `features/chat/server/delete-message.ts`

Edit: own text messages only, within 5-minute window. Sets `edited_at`, preserves `original_content`. Delete: tombstone (set `deleted_at`, clear `content`). Both push Realtime UPDATE.

#### Task 8.8: Quote Replies

**Files:**

- Create: `features/chat/components/QuotePreview.tsx`

Set `parent_id` on new message. Show quoted message preview above composer. Long press / right click to quote.

#### Task 8.9: Voice Messages

**Files:**

- Create: `features/chat/components/VoiceRecorder.tsx`
- Create: `features/chat/components/VoicePlayer.tsx`

MediaRecorder API (Opus/WebM), 90s max duration. wavesurfer.js playback with waveform, auto-play next in sequence. Zustand singleton player.

#### Task 8.10: Chat Deletion

**Files:**

- Create: `features/chat/server/delete-chat.ts`
- Create: `lib/inngest/functions/chat-delete.ts`

Inngest: delete media files from Storage, delete messages, delete chat. Broadcast notifies both participants.

#### Task 8.11: Write Tests

**Files:**

- Create: `tests/unit/features/chat/message-schema.test.ts`
- Create: `tests/unit/features/chat/message-edit.test.ts`
- Create: `tests/integration/features/chat/realtime.test.ts`
- Create: `tests/e2e/chat.spec.ts`

**Dependencies:** Phase 7 (matches must create chats)
**Expected Outcome:** Two matched users can chat in real-time with all message types, status indicators, and editing.
**Acceptance Criteria:**

- Chat list shows all active chats with preview and unread count
- Real-time message delivery works (< 500ms latency)
- Text, image, and voice messages send and display correctly
- Typing indicator appears when other user is typing
- Online/offline status updates correctly via Presence
- Message status progresses: sent → delivered → read
- Edit works within 5-minute window for own text messages only
- Delete creates tombstone
- Quote replies display preview
- Voice playback works (wavesurfer.js)
- All tests pass

---

## Phase 9: Notifications & Web Push

**Goal:** Complete notification system with in-app, Web Push, and email delivery channels.

**Scope:** Notification dispatch via Inngest, notification center UI, Web Push Service Worker, push subscription management, email notifications via Resend, centralized `createNotification()` factory.

### Tasks

#### Task 9.0: Notification Factory & Templates

**Files:**

- Create: `lib/notifications/types.ts`
- Create: `lib/notifications/factory.ts`
- Create: `lib/notifications/templates.ts`
- Create: `lib/notifications/links.ts`
- Create: `lib/notifications/validation.ts`
- Modify: `messages/ru.json` (add notifications namespace)
- Modify: `messages/en.json` (add notifications namespace)
- Test: `tests/unit/lib/notifications/templates.test.ts`
- Design doc: `docs/12-notifications.md`

- [ ] **Step 1: Write types, factory, templates, links, and validation**

Implement exactly as specified in `docs/12-notifications.md`:

- `lib/notifications/types.ts` — `NotificationType` (11 types: like_received, match_created, message_new, like_revoked, photo_approved, photo_rejected, photo_removed_by_moderator, account_blocked, account_reinstated, account_suspension_expired, inactivity_warning), `NotificationContext`, `NotificationOptions`, `NotificationPayload`
- `lib/notifications/templates.ts` — `TEMPLATE_MAP` mapping each type to its `titleKey` and `bodyKey` i18n keys, `resolveTemplate(type)`
- `lib/notifications/links.ts` — `resolveLink(type, context)` centralized route generation (e.g., `match_created` → `/matches/:id`, `message_new` → `/chat/:id`, `like_received` → `/profiles/:id`)
- `lib/notifications/validation.ts` — `REQUIRED_FIELDS` per type, `validateContext(type, context)` throws `VALIDATION_INVALID_INPUT` on missing fields
- `lib/notifications/factory.ts` — `createNotification(type, context, options?)` synchronous factory, no I/O, returns `NotificationPayload` with `title_key`, `body_key`, `payload` jsonb

- [ ] **Step 2: Add notification i18n messages**

Add all 11 notification type templates to `messages/ru.json` and `messages/en.json` under the `"notifications"` key, using the exact translations from `docs/12-notifications.md`.

- [ ] **Step 3: Write CI enforcement test**

```typescript
// tests/unit/lib/notifications/templates.test.ts
import { describe, it, expect } from 'vitest'
import ruMessages from '@/messages/ru.json'
import enMessages from '@/messages/en.json'

const ALL_TYPES = [
  'like_received',
  'like_revoked',
  'match_created',
  'message_new',
  'photo_approved',
  'photo_rejected',
  'photo_removed_by_moderator',
  'account_blocked',
  'account_reinstated',
  'account_suspension_expired',
  'inactivity_warning',
] as const

describe('notification templates', () => {
  it('should have RU translation for every type', () => {
    for (const type of ALL_TYPES) {
      const t = ruMessages.notifications[type as keyof typeof ruMessages.notifications]
      expect(t).toBeDefined(`Missing RU: ${type}`)
      expect(t.title).toBeTruthy()
      expect(t.body).toBeTruthy()
    }
  })

  it('should have EN translation for every type', () => {
    for (const type of ALL_TYPES) {
      const t = enMessages.notifications[type as keyof typeof enMessages.notifications]
      expect(t).toBeDefined(`Missing EN: ${type}`)
      expect(t.title).toBeTruthy()
      expect(t.body).toBeTruthy()
    }
  })
})
```

#### Task 9.1: Inngest Notification Dispatch

**Files:**

- Create: `lib/inngest/functions/notification-dispatch.ts`

Single dispatch function consuming `notification/send` Inngest events. Flow:

1. Check `notification_preferences` — if type is disabled for this user, return early
2. INSERT into `notifications` table using the pre-built `NotificationPayload` from the factory (title_key, body_key, payload)
3. Check Presence for online status
4. If online → Realtime (automatic via Postgres Changes on the `notifications` table, which is in the `supabase_realtime` publication)
5. If offline → Web Push (resolve translated title/body from `profiles.locale`, iterate `push_subscriptions`, handle 404/410 dead subscription cleanup) + Email if type is in the email allowlist (`match_created`, `account_blocked`, `account_reinstated`, `account_suspension_expired`, `photo_removed_by_moderator`, `inactivity_warning`)

All notification payloads are built by `createNotification()` — the dispatch function never constructs title_key/body_key inline.

#### Task 9.2: Notification Center Page

**Files:**

- Create: `app/(app)/notifications/page.tsx`
- Create: `features/notifications/components/NotificationList.tsx`
- Create: `features/notifications/components/NotificationItem.tsx`
- Create: `features/notifications/hooks/useNotifications.ts`

Chronological list with infinite scroll, unread visual distinction, click-to-navigate (marks read + redirects to entity). Realtime subscription on `notifications` for live updates. Badge count in AppBar.

#### Task 9.3: Web Push Service Worker

**Files:**

- Create: `public/sw.js`

```javascript
self.addEventListener('push', (event) => {
  const payload = event.data.json()
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon ?? '/icon-192.png',
      badge: payload.badge ?? '/badge-72.png',
      data: { url: payload.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(url))
      if (existing) return existing.focus()
      return clients.openWindow(url)
    }),
  )
})
```

#### Task 9.4: Push Subscription Management

**Files:**

- Create: `lib/web-push/register.ts` (client-side SW registration + subscribe)
- Create: `lib/web-push/send.ts` (server-side dispatch via web-push library)
- Create: `app/api/push/subscribe/route.ts` (persist subscription)

Client registers SW on user gesture ("Enable notifications" button), subscribes with VAPID key, POSTs to server to persist in `push_subscriptions`.

#### Task 9.5: Notification Preferences

**Files:**

- Create: `app/(app)/settings/page.tsx` (add notification prefs section)
- Create: `features/notifications/components/NotificationPreferences.tsx`

Toggle per notification type and channel (in-app, push, email). Read/write to `notification_preferences`.

#### Task 9.6: Email Notifications (Resend)

**Files:**

- Create: `lib/resend/client.ts`
- Create: `lib/resend/templates.ts`

Resend client setup. Email templates stored as constants in `lib/resend/templates.ts`, keyed by `template_id` + `locale`. Helper `sendEmail({ to, templateId, locale, variables })` selects the correct template and calls the Resend API.

All 6 email templates defined below use `{{variable}}` placeholder syntax. The notification factory's output determines WHICH template to send — email is one channel of the dispatch function, not a separate code path.

All templates below use `{{variable}}` placeholder syntax. The Resend client substitutes actual values at send time.

**Template 1: Magic Link Email**

| Lang | Subject               | Body                                                                                                                                                                                                                                                      |
| ---- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RU   | `Вход в Nikah Help`   | `Здравствуйте,\n\nВы запросили вход в Nikah Help.\n\nНажмите на ссылку ниже, чтобы войти в аккаунт:\n\n{{magic_link}}\n\nСсылка действует ограниченное время. Если вы не запрашивали вход, просто проигнорируйте это письмо.\n\nС уважением,\nNikah Help` |
| EN   | `Login to Nikah Help` | `Hello,\n\nYou requested to sign in to Nikah Help.\n\nClick the link below to access your account:\n\n{{magic_link}}\n\nThis link is valid for a limited time. If you did not request this, please ignore this email.\n\nBest regards,\nNikah Help`       |

Sent via Supabase Auth → Resend integration. The `{{magic_link}}` variable is injected by Supabase Auth.

**Template 2: Account Blocked (Moderation)**

| Lang | Subject                         | Body                                                                                                                                                                                                                                           |
| ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RU   | `Аккаунт временно заблокирован` | `Здравствуйте,\n\nВаш аккаунт в Nikah Help был временно заблокирован из-за нарушения правил платформы.\n\nЕсли вы считаете, что это произошло по ошибке, пожалуйста, свяжитесь с поддержкой:\n\n{{support_email}}\n\nС уважением,\nNikah Help` |
| EN   | `Account temporarily suspended` | `Hello,\n\nYour Nikah Help account has been temporarily suspended due to a violation of platform rules.\n\nIf you believe this was a mistake, please contact support:\n\n{{support_email}}\n\nBest regards,\nNikah Help`                       |

Sent by the `account-block` Inngest function on moderator permanent-ban action.

**Template 3: Account Reinstated**

| Lang | Subject                | Body                                                                                                                                                                |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RU   | `Аккаунт восстановлен` | `Здравствуйте,\n\nВаш аккаунт в Nikah Help был восстановлен. Теперь вы снова можете пользоваться сервисом.\n\nБлагодарим за понимание.\n\nС уважением,\nNikah Help` |
| EN   | `Account reinstated`   | `Hello,\n\nYour Nikah Help account has been restored. You can now continue using the service.\n\nThank you for your understanding.\n\nBest regards,\nNikah Help`    |

Sent by the admin "lift block" flow. Variables: none.

**Template 4: Photo Removed (Moderation)**

| Lang | Subject         | Body                                                                                                                                                                                                          |
| ---- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RU   | `Фото удалено`  | `Здравствуйте,\n\nОдно из ваших фото было удалено, так как оно не соответствует правилам Nikah Help.\n\nПожалуйста, загрузите новое фото, соответствующее требованиям платформы.\n\nС уважением,\nNikah Help` |
| EN   | `Photo removed` | `Hello,\n\nOne of your photos has been removed because it does not comply with Nikah Help guidelines.\n\nPlease upload a new photo that meets the platform requirements.\n\nBest regards,\nNikah Help`        |

Sent by the moderator "remove photo" action. Variables: none.

**Template 5: Inactivity Email ("We miss you")**

| Lang | Subject                     | Body                                                                                                                                                                                                                |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RU   | `Мы скучаем по вам`         | `Здравствуйте,\n\nМы заметили, что вы давно не заходили в Nikah Help.\n\nВозможно, вас уже ждут новые знакомства и взаимные симпатии.\n\nВернитесь и продолжите поиск:\n\n{{app_link}}\n\nС уважением,\nNikah Help` |
| EN   | `We miss you at Nikah Help` | `Hello,\n\nWe noticed that you haven't visited Nikah Help for a while.\n\nYou may already have new matches waiting for you.\n\nCome back and continue your journey:\n\n{{app_link}}\n\nBest regards,\nNikah Help`   |

Sent by Vercel Cron `/api/cron/inactive-account-warn` for users with `last_seen_at < now() - 90 days`. `{{app_link}}` resolves to `https://nikah.help/feed`.

**Template 6: Notification Email (New Match)**

| Lang | Subject                         | Body                                                                                                                                                                  |
| ---- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RU   | `У вас новая взаимная симпатия` | `Здравствуйте,\n\nУ вас появилась новая взаимная симпатия в Nikah Help.\n\nПерейдите в приложение, чтобы начать общение:\n\n{{app_link}}\n\nС уважением,\nNikah Help` |
| EN   | `You have a new match`          | `Hello,\n\nYou have a new match on Nikah Help.\n\nOpen the app to start a conversation:\n\n{{app_link}}\n\nBest regards,\nNikah Help`                                 |

Sent by `notification-dispatch` Inngest function when user is offline AND email channel is enabled for `match_created` notification type.

**Implementation:** Templates are stored as constants in `lib/resend/templates.ts`, keyed by `template_id` + `locale`. A helper `sendEmail({ to, templateId, locale, variables })` selects the correct template and calls the Resend API. The Resend client (`lib/resend/client.ts`) is initialized with `RESEND_API_KEY`.

#### Task 9.7: Write Tests

**Files:**

- Create: `tests/unit/lib/web-push/send.test.ts`
- Create: `tests/integration/features/notifications/dispatch.test.ts`
- Create: `tests/e2e/notifications.spec.ts`

**Dependencies:** Phase 8 (chat must create notifications for new messages)
**Expected Outcome:** Users receive notifications in-app (real-time), via Web Push (offline), and email. Preferences respected.
**Acceptance Criteria:**

- `createNotification()` factory used by ALL notification-producing code (no inline title_key/body_key construction)
- 11 notification types have RU + EN templates with CI enforcement
- Notification dispatched on like, match, new message, photo moderation
- In-app notification badge updates in real-time via Realtime
- Web Push delivered when user is offline
- Dead subscriptions (404/410) cleaned up automatically
- Notification center shows history with pagination
- Click navigates to entity and marks read
- Preferences toggle works per-type and per-channel
- All tests pass

---

## Phase 10: Payments (T-Bank)

**Goal:** Working T-Bank subscription payment flow with iframe integration, webhook handling, and recurring payments.

**Scope:** T-Bank Init API, iframe payment form, webhook Route Handler, subscription activation, recurring renewal via Vercel Cron, subscription UI.

### Tasks

#### Task 10.1: T-Bank API Client

**Files:**

- Create: `lib/tbank/client.ts`
- Create: `lib/tbank/types.ts`

Implement Init API call: `POST https://securepay.tinkoff.ru/v2/Init` with token generation (SHA-256 signature). Functions: `initiatePayment`, `generateToken`, `verifySignature`.

#### Task 10.2: Payment Initiation Server Action

**Files:**

- Create: `features/subscription/actions.ts`
- Create: `features/subscription/server/init-payment.ts`
- Create: `features/subscription/schemas.ts`

Read price from `pricing_plans` (code = `subscription_monthly`), never from client. Generate unique `OrderId` (UUID v4). Call T-Bank Init API. Return `{ paymentId, paymentURL }`.

#### Task 10.3: Iframe Payment Form

**Files:**

- Create: `app/(app)/subscription/page.tsx` (RSC)
- Create: `features/subscription/components/PaymentIframe.tsx`
- Create: `features/subscription/components/SubscriptionPage.tsx`

Load T-Bank integration script. Init `PaymentIntegration`. Render iframe with `PaymentURL` returned from backend.

#### Task 10.4: Payment Webhook Route Handler

**Files:**

- Create: `app/api/webhooks/tbank/route.ts`
- Create: `lib/tbank/webhook.ts` (signature verification)

Handle `CONFIRMED`, `REJECTED`, `REFUNDED` statuses. On CONFIRMED: activate subscription (upsert `subscriptions`, set `status = 'active'`, `current_period_end = now + 30d`).

#### Task 10.5: Subscription Activation & Status

**Files:**

- Create: `features/subscription/server/activate-subscription.ts`
- Create: `features/subscription/server/check-subscription.ts`

`has_active_subscription()` already exists in DB. UI reads subscription status and displays current tier info.

#### Task 10.6: Recurring Payment Renewal (Vercel Cron)

**Files:**

- Create: `app/api/cron/subscription-renewal/route.ts`

Daily cron: find subscriptions nearing expiration (`cancel_at_period_end = false`, `current_period_end` within 24h). Emit `subscription/renew` Inngest event. Inngest function calls T-Bank Init with `CustomerKey` (no `Recurrent` flag).

#### Task 10.7: Cancel Subscription

**Files:**

- Create: `features/subscription/server/cancel-subscription.ts`

Set `cancel_at_period_end = true`. User retains premium until `current_period_end`. No further auto-renewal.

#### Task 10.8: Subscription UI

**Files:**

- Create: `features/subscription/components/PricingCard.tsx`

Show current tier, benefits, price, "Subscribe" / "Cancel" buttons. Female users: "All features are free for women."

#### Task 10.9: Write Tests

**Files:**

- Create: `tests/unit/lib/tbank/token.test.ts`
- Create: `tests/integration/api/webhooks/tbank.test.ts`
- Create: `tests/e2e/subscription.spec.ts`

- [ ] **Step 1: Test T-Bank token generation**

```typescript
describe('generateToken', () => {
  it('should generate deterministic SHA-256 hash', () => {
    const token = generateToken({ Amount: 100000, OrderId: 'test', TerminalKey: 'key' })
    expect(token).toHaveLength(64)
  })

  it('should exclude Token field from hash input', () => {
    const t1 = generateToken({ Amount: 100, Token: 'old' })
    const t2 = generateToken({ Amount: 100, Token: 'new' })
    expect(t1).toBe(t2)
  })
})
```

- [ ] **Step 2: Test webhook signature verification**

- [ ] **Step 3: Test subscription activation and expiry**

- [ ] **Step 4: Test cron renewal logic**

**Dependencies:** Phase 7 (tariff limits reference subscription status)
**Expected Outcome:** Male users can subscribe via T-Bank, subscription activates on payment, auto-renews, cancels properly.
**Acceptance Criteria:**

- Payment initiation calls T-Bank Init API with correct signature
- Iframe renders payment form
- Webhook CONFIRMED activates subscription
- Subscription status reflects in tariff limit checks
- Daily cron triggers renewal for expiring subscriptions
- Cancel sets `cancel_at_period_end` correctly
- Female users see "free" message
- All tests pass

---

## Phase 11: Blocking, Reports & Moderation

**Goal:** Working user block system, report filing, moderator panel, and admin user management.

**Scope:** Personal blocklist (/settings/blocked), block/unblock flow, report submission, moderator queue (/admin/reports), moderator actions (remove photo, block user), admin lift block, suspension enforcement in proxy.ts.

### Tasks

#### Task 11.1: User Block / Unblock

**Files:**

- Create: `features/profile/actions.ts` (add blockUser, unblockUser)
- Create: `features/profile/server/block-user.ts`
- Create: `features/profile/server/unblock-user.ts`

`blockUser`: read target email, compute peppered hash, INSERT into `blocks`, revoke match if exists. `unblockUser`: DELETE from `blocks`.

#### Task 11.2: Personal Blocklist Page

**Files:**

- Create: `app/(app)/settings/blocked/page.tsx`
- Create: `features/profile/components/BlockList.tsx`
- Create: `features/profile/components/BlockListItem.tsx`

List with search, pagination (infinite scroll), avatar (or placeholder for ghost blocks), "Account deleted" for ghost blocks, "Unblock" button. Email NEVER shown.

#### Task 11.3: Report Submission

**Files:**

- Create: `features/reports/actions.ts`
- Create: `features/reports/schemas.ts`
- Create: `features/reports/components/ReportDialog.tsx`

Report dialog (free-text comment, max 500 chars). Rate limit 5/day. Submit via Server Action. Auto-triage: ≥3 reports on same photo within 24h → set `moderation_status = 'manual_review'`.

#### Task 11.4: Admin Layout & RBAC

**Files:**

- Create: `app/(admin)/layout.tsx`
- Create: `app/(admin)/admin/page.tsx` (redirect to /admin/reports)
- Create: `features/admin/components/AdminGuard.tsx`

Check `role IN ('moderator', 'admin')`. Redirect non-authorized users. Server-side RBAC on all admin Route Handlers.

#### Task 11.5: Moderator Report Queue

**Files:**

- Create: `app/(admin)/admin/reports/page.tsx`
- Create: `features/admin/components/ReportList.tsx`
- Create: `features/admin/components/ReportDetail.tsx`
- Create: `features/admin/server/get-reports.ts`

Filterable, paginated report list. Detail view: reported entity preview, reporter comment, history.

#### Task 11.6: Moderator Actions

**Files:**

- Create: `features/admin/actions.ts`
- Create: `features/admin/server/resolve-report.ts`
- Create: `features/admin/server/remove-photo.ts`
- Create: `features/admin/server/block-user-moderator.ts`

Dismiss, Remove Photo, Block User. Block user: insert into `user_suspensions` + `banned_emails`, unpublish profile, revoke sessions, send email.

#### Task 11.7: Admin Block List Panel

**Files:**

- Create: `app/(admin)/admin/blocks/page.tsx`
- Create: `features/admin/components/BlockListPanel.tsx`
- Create: `features/admin/server/get-blocks.ts`

Paginated table of all active blocks. Filter by status, date, banned_by. Search by email/name. Lift button (admin only).

#### Task 11.8: Admin User Management

**Files:**

- Create: `app/(admin)/admin/users/page.tsx`
- Create: `features/admin/server/get-users.ts`

User search, view, role assignment (admin only).

#### Task 11.9: Suspension Enforcement in proxy.ts

**Files:**

- Modify: `app/proxy.ts` (add suspension check)

Check `is_user_suspended()` on every authenticated request. If suspended → sign out, redirect to `/blocked` page.

#### Task 11.10: Blocked Page

**Files:**

- Create: `app/(public)/blocked/page.tsx`

Static page: "This account has been blocked." Contact support link. No re-login form.

#### Task 11.11: Inngest Functions for Moderation

**Files:**

- Create: `lib/inngest/functions/account-block.ts`
- Create: `lib/inngest/functions/photo-moderate-remove.ts`

Account block: revoke sessions, unpublish, send email. Photo removal: delete variants from Storage.

#### Task 11.12: Write Tests

**Files:**

- Create: `tests/unit/features/admin/report-schema.test.ts`
- Create: `tests/unit/lib/crypto/email-hash.test.ts`
- Create: `tests/integration/features/admin/moderation.test.ts`
- Create: `tests/e2e/moderation.spec.ts`

**Dependencies:** Phase 6 (profiles must exist to block/report), Phase 3 (auth/proxy.ts for suspension enforcement)
**Expected Outcome:** Users can block, report. Moderators can review reports, remove photos, block users. Admins can lift blocks. Suspensions enforced at proxy level.
**Acceptance Criteria:**

- Block hides profiles, prevents likes, deletes matches/chats
- Block persists past account deletion via peppered hash
- Block rebind works on re-registration
- Report submission rate-limited to 5/day
- Auto-triage hides photos with ≥3 reports
- Moderator can dismiss reports, remove photos, block users
- Admin can lift blocks
- Suspended users redirected to /blocked page
- Blocklist UI shows both live and ghost blocks
- All tests pass

---

## Phase 12: Internationalization, PWA & Polish

**Goal:** Multi-language support (RU/EN), PWA installability, theming, UI polish, error boundaries, performance optimization.

**Scope:** next-intl setup, message files, PWA manifest + icons, install prompt, theme system, shadcn/ui integration, loading/error states, CWV optimization.

### Tasks

#### Task 12.1: next-intl Setup

**Files:**

- Create: `messages/ru.json`
- Create: `messages/en.json`
- Create: `i18n/routing.ts`
- Create: `lib/i18n/request.ts`
- Modifies: `app/layout.tsx` (wrap with NextIntlClientProvider)

Configure 2 locales (ru, en), default `ru`. Define routing strategy.

#### Task 12.2: Translation Message Files

**Files:**

- Modify: `messages/ru.json`
- Modify: `messages/en.json`

Add all translation keys for: auth, onboarding, feed, chat, notifications, subscription, settings, admin, errors, common UI.

#### Task 12.3: PWA Manifest & Icons

**Files:**

- Create: `public/manifest.webmanifest`
- Create: `public/icon-192.png`
- Create: `public/icon-512.png`
- Create: `public/icon-maskable-512.png`
- Create: `public/apple-touch-icon.png`
- Create: `public/badge-72.png`
- Create: `public/favicon.ico`
- Modify: `app/layout.tsx` (add metadata: manifest, themeColor, appleWebApp, icons)

#### Task 12.4: Install Prompt UX

**Files:**

- Create: `features/pwa/components/InstallBanner.tsx`
- Create: `features/pwa/hooks/useInstallPrompt.ts`

Capture `beforeinstallprompt`. Show banner after first mutual match. Respect dismissed/snoozed state. iOS Safari detection + guidance.

#### Task 12.5: Theme System (next-themes)

**Files:**

- Create: `components/providers/ThemeProvider.tsx`
- Modify: `app/layout.tsx` (wrap with ThemeProvider)
- Modify: `app/globals.css` (add .dark variables)

Light/dark themes with Tailwind CSS variables. Toggle in settings. Persist preference.

#### Task 12.6: shadcn/ui Integration

**Files:**

- Create: `components/ui/` (all shadcn components)
- Create: `components.json`

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button input dialog sheet switch checkbox card avatar slider combobox textarea tabs
```

#### Task 12.7: Loading & Error States

**Files:**

- Create: `components/layout/Skeleton.tsx`
- Create: `components/layout/EmptyState.tsx`
- Create: `components/layout/ErrorBoundary.tsx`
- Modify: all pages (add Suspense boundaries, error.tsx)

Every page: loading skeleton, empty state with illustration + CTA, error boundary with retry.

#### Task 12.8: Performance Optimization

- Lazy load below-fold feed cards via IntersectionObserver
- Defer Realtime channel subscriptions to `requestIdleCallback`
- Verify `<picture>` elements have `width`/`height` for CLS prevention
- Set correct `staleTime` values: profile 5min, feed 1min, chat 0
- Verify CSS purge → gzip ≤ 30 KB for `/feed`

#### Task 12.9: Sentry Setup

**Files:**

- Create: `sentry.client.config.ts`
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`
- Modify: `next.config.ts` (wrap with `withSentryConfig`)

PII stripping, release tagging, source map upload.

#### Task 12.10: Write Tests

**Files:**

- Create: `tests/unit/lib/i18n/messages.test.ts` (validate keys exist in both locales)
- Create: `tests/e2e/i18n.spec.ts`
- Create: `tests/e2e/pwa.spec.ts`

**Dependencies:** Phases 3-11 (all features must exist to translate and polish)
**Expected Outcome:** App works in RU and EN, installable as PWA, dark/light themes, polished UI with loading/error states.
**Acceptance Criteria:**

- All UI text is translatable (no hardcoded strings)
- Switching language updates all text immediately
- PWA manifest valid, icons load, installable on Android/iOS
- Install prompt shows after first match
- Theme toggle works, persists preference
- All pages have loading skeleton, empty state, error boundary
- Lighthouse score ≥ 90 for `/feed`
- Sentry captures errors on both client and server
- All tests pass

---

## Phase 13: End-to-End Testing & Security Hardening

**Goal:** Comprehensive test coverage, security audit, CSP hardening, performance validation.

**Scope:** E2E test suite for critical flows, RLS policy tests, CSP validation, rate limiting tests, load testing preparation.

### Tasks

#### Task 13.1: Auth & Onboarding E2E Tests

**Files:**

- Create: `tests/e2e/auth.spec.ts`
- Create: `tests/e2e/onboarding.spec.ts`

Full flow: Magic Link (mocked), onboarding all 4 steps, bio generation. Test error cases: invalid email, underage DOB, missing required fields.

#### Task 13.2: Core Flow E2E Tests

**Files:**

- Create: `tests/e2e/likes-chat.spec.ts`
- Create: `tests/e2e/feed.spec.ts`

Send like, mutual match, open chat, send messages, verify real-time delivery.

#### Task 13.3: Payment E2E Tests

**Files:**

- Create: `tests/e2e/subscription.spec.ts`

Initiate payment, verify iframe, mock webhook, verify subscription activation, verify like limit lifted.

#### Task 13.4: Moderation E2E Tests

**Files:**

- Create: `tests/e2e/moderation.spec.ts`

File report, moderator views queue, dismisses/acts, verify actions.

#### Task 13.5: RLS Security Tests

**Files:**

- Create: `tests/integration/security/rls-policies.test.ts`

For each table: attempt unauthorized SELECT/INSERT/UPDATE/DELETE with different roles. Verify RLS blocks.

#### Task 13.6: Rate Limiting Tests

**Files:**

- Create: `tests/integration/security/rate-limiting.test.ts`

Verify auth callback rate limit, photo stream rate limit, like/message send rate limits.

#### Task 13.7: CSP Audit

Verify no `unsafe-inline` in production CSP. Validate nonce propagation. Test that blocked inline scripts don't execute.

#### Task 13.8: Dependency Audit

```bash
pnpm audit
pnpm outdated
```

Update any vulnerable packages.

#### Task 13.9: Write Tests

All tests must pass in CI.

**Dependencies:** Phases 0-12 (complete application)
**Expected Outcome:** Full test suite passing, security verified, app ready for launch.
**Acceptance Criteria:**

- All E2E tests pass on Preview Deployments
- RLS tests verify every table policy
- Rate limiting tests confirm Upstash enforcement
- CSP has no `unsafe-inline` exceptions beyond required nonces
- No critical/high vulnerabilities in dependencies
- Coverage ≥ 80% lines, 80% functions, 75% branches

---

## Phase 14: MVP Launch

**Goal:** Production deployment with all infrastructure configured.

**Scope:** Supabase production setup, Vercel production deploy, Cloudflare DNS/WAF, monitoring, launch checklist.

### Tasks

#### Task 14.1: Supabase Production Setup

- Apply all migrations to production Supabase project
- Enable Supabase Branching for PR preview databases
- Configure Supabase Auth: Magic Link provider, redirect URLs, email templates (Resend)
- Run GeoNames import script
- Seed `pricing_plans`

#### Task 14.2: Vercel Production Deploy

- Connect GitHub repo to Vercel
- Set ALL environment variables in Vercel Project Settings
- Set Node.js version to 22.x LTS
- Deploy to production

#### Task 14.3: Cloudflare Setup

- Point DNS to Vercel
- Enable WAF with OWASP rules
- Configure Cache Rules for static assets and `/api/photos/stream` (private, no cache)
- Set up rate limiting rules for auth endpoints

#### Task 14.4: Third-Party Service Configuration

- Inngest: production project, signing key
- T-Bank: production terminal, API token, webhook URL
- OpenAI: production API key with usage limits
- Resend: verified sending domain
- Upstash Redis: production instance
- VAPID keys: generate and configure
- Sentry: production project, Slack alerts

#### Task 14.5: Admin User Setup

```sql
UPDATE profiles SET role = 'admin' WHERE email = '<admin-email>';
```

#### Task 14.6: Monitoring & Alerts

- Sentry: verify error capture on both client and server
- Vercel Analytics: verify RUM data flowing
- PostHog: verify events flowing
- Inngest Dashboard: verify functions registered
- Set up Slack alerts for: error spike (>20/min), 75th percentile LCP > 3s for 6h, `/api/photos/process` P95 > 8s

#### Task 14.7: Legal

- Publish Privacy Policy page
- Publish Terms of Service page
- GDPR: verify data export and deletion flows

#### Task 14.8: Final Launch Verification

Run through the complete MVP Launch Checklist from 07-infrastructure.md. Every item must be checked.

**Dependencies:** Phase 13 (all tests passing)
**Expected Outcome:** Production system live, all infrastructure configured, monitoring active.
**Acceptance Criteria:** Every item in the MVP Launch Checklist (23 items) is verified.

---

## Priority Summary

### MVP (Must Ship)

- Phase 0: Project Init
- Phase 1: Database Schema
- Phase 2: Core Infrastructure (Supabase Clients, Error Handling, Rate Limiting, Idempotency)
- Phase 3: Auth & Onboarding Steps 1-2
- Phase 4: Onboarding Steps 3-4 & AI Bio
- Phase 5: Image Processing & Photo Delivery
- Phase 6: Feed & Profile System
- Phase 7: Likes, Matching & Tariff Limits
- Phase 8: Real-time Chat
- Phase 9: Notifications & Web Push
- Phase 10: Payments (T-Bank)
- Phase 11: Blocking & Moderation
- Phase 12: i18n, PWA & Polish
- Phase 13: Testing & Security
- Phase 14: Launch

### Post-MVP

- Voice message transcription (AI)
- Video chat integration
- Advanced matching algorithm (ML-based recommendations)
- iOS/Android native clients (requires Route Handler migration for all Server Actions)
- APNs / FCM push support (schema already supports it)
- Temp bans in moderator UI (schema already supports `temp_ban`)
- Automated A/B testing framework for feed ranking

---

## Architecture Improvement Proposals

1. **Rate limiting middleware** — ✅ RESOLVED. Full design in `docs/10-rate-limiting.md`. Implemented in Phase 2 Tasks 2.9-2.10.
2. **Idempotency middleware** — ✅ RESOLVED. Full design in `docs/11-idempotency.md`. Implemented in Phase 2 Tasks 2.11-2.12.
3. **Notification template system** — ✅ RESOLVED. Full design in `docs/12-notifications.md`. Implemented in Phase 9 Tasks 9.0-9.1.
4. **Photo variant constants** — ✅ RESOLVED. Full design in `docs/13-photo-variants.md`. Implemented in Phase 5 Task 5.0.
5. **Feature flags:** Add a simple feature flag system (env-var based for MVP) so features can be toggled without redeploy.

---

## Missing Documentation Items

The following are not defined in the docs and need clarification:

1. **T-Bank webhook exact payload format** — spec only shows `OrderId, Status, PaymentId, Amount, CardId, RebillId`. Full field list and potential error codes not provided.
2. **OpenAI moderation fallback behavior** — ✅ RESOLVED: fallback to DeepSeek API after 60s timeout from OpenAI, using the same structured output schema.
3. **Cloudflare cache rule specifics** — which exact paths, TTLs, cache-key composition.
4. **Resend email templates** — ✅ RESOLVED: 6 templates provided (Magic Link, Account Blocked, Account Reinstated, Photo Removed, Inactivity, New Match) in RU + EN. See Task 9.6.
5. **GDPR data export format** — JSON schema for user data export not specified.
6. **Backup strategy** — Supabase backup schedule and retention not specified.
7. **Seed data** — test profiles, photos, chats for development not defined.
8. **PostHog feature flags** — no feature flag taxonomy for gradual rollouts (future consideration).
9. **Error code taxonomy** — ✅ RESOLVED. Full design in `docs/09-error-handling.md`. 53 error codes across 10 categories with HTTP status mapping, RU/EN i18n, and CI enforcement. Implemented in Phase 2 Tasks 2.6-2.8.
10. **Photo moderation appeal flow** — user can see rejection reason but no appeal process defined.

### Newly Resolved (since original plan)

11. **Rate limiting system** — ✅ RESOLVED. `docs/10-rate-limiting.md`. Reusable `withRateLimit()` wrapper, 6 presets, IP hashing, role bypass, fail-open. Phase 2 Tasks 2.9-2.10.
12. **Idempotency system** — ✅ RESOLVED. `docs/11-idempotency.md`. `withIdempotency()` wrapper, atomic Redis locks, UUID v4 key validation, user-scoped keys. Phase 2 Tasks 2.11-2.12.
13. **Notification system** — ✅ RESOLVED. `docs/12-notifications.md`. Centralized `createNotification()` factory, 11 types, i18n templates, link resolution, channel routing. Phase 9 Tasks 9.0-9.1.
14. **Photo variant configuration** — ✅ RESOLVED. `docs/13-photo-variants.md`. Shared `PHOTO_VARIANTS` config, `resolveServeVariant()`, upload constraints, storage path builders. Phase 5 Task 5.0.
    ≠≠
