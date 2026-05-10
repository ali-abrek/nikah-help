# nikah-help

Production codebase for the NikahHelp matchmaking app. Next.js 16 (App Router) + React 19 + Supabase + Upstash Redis + Inngest + Sharp + Sentry, deployed on Vercel.

> Architecture rationale, RLS design, the photo-variant pipeline, the rate-limit/idempotency/error contracts, and the notification fan-out all live in [`/docs`](../docs). Read those before changing anything.

## Stack at a glance

- **Web** – Next.js 16 with the new `proxy.ts` (replaces `middleware.ts`), App Router, RSC.
- **Auth & data** – Supabase (Auth + Postgres + Realtime + Storage). RLS on every user-data table.
- **Background jobs** – Inngest functions for photo moderation, abandoned-upload cleanup, bio regeneration, notification dispatch.
- **Caching/limits** – Upstash Redis (`@upstash/ratelimit` + idempotency store).
- **Email** – Resend.
- **Push** – Web Push (VAPID).
- **Image processing** – Sharp (Node runtime only).
- **Observability** – Sentry via `@sentry/nextjs` + `instrumentation.ts`.

## Local setup

```bash
pnpm install
cp .env.local.example .env.local   # then fill in real secrets
pnpm dev
```

The boot-required environment variables are validated by [`lib/env.ts`](lib/env.ts) — `validateEnv()` throws on the first missing one. See `.env.local.example` for the full list.

## Useful scripts

| Command                             | What it does                                                          |
| ----------------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                          | Next dev server with Turbopack                                        |
| `pnpm build`                        | Production build                                                      |
| `pnpm typecheck`                    | `tsc --noEmit` over the whole repo                                    |
| `pnpm lint` / `pnpm lint:fix`       | ESLint                                                                |
| `pnpm format:check` / `pnpm format` | Prettier                                                              |
| `pnpm test` / `pnpm test:unit`      | Vitest                                                                |
| `pnpm test:ci`                      | Vitest with coverage                                                  |
| `pnpm test:e2e`                     | Playwright E2E (run against a deployed preview URL)                   |
| `pnpm db:typegen`                   | Regenerate `types/database.types.ts` from the linked Supabase project |
| `pnpm verify`                       | typecheck + lint + format:check + tests (the same gate CI uses)       |

## Repository layout

```
app/            – Next.js App Router pages and API routes
  (app)/        – authenticated app surface (protected by proxy.ts)
  (public)/     – auth + marketing
  api/          – Route Handlers (cron, photos, chats, likes, feed, notifications, …)
  api/cron/     – Vercel Cron entrypoints, gated by VERCEL_CRON_SECRET
features/       – feature-scoped server actions, schemas, components, hooks
  auth/         – sign-in flows
  chat/         – realtime messaging
  feed/         – discovery feed + radius search
  geo/          – country/city autocomplete
  likes/        – like + match logic
  photos/       – photo upload UX (server pieces in features/profile)
  profile/      – onboarding + edit
lib/            – cross-cutting utilities
  api/          – withAuth, cron auth helpers
  errors/       – AppError, registry, handler, logger
  idempotency/  – Upstash-backed idempotency wrapper
  ratelimit/    – Upstash-backed rate limiter
  image-processing/ – Sharp pipeline + variant config
  inngest/      – background functions
  notifications/, web-push/, resend/ – delivery layer
  supabase/     – server/admin/client factories + typed RPC helpers
proxy.ts        – auth/JWT/proxy edge layer (Next 16 replaces middleware.ts)
supabase/       – migrations, seed
types/          – generated DB types (regenerate via `pnpm db:typegen`)
tests/          – unit, integration, e2e
docs/           – architecture and infrastructure documentation (authoritative)
```

## Conventions

- **API routes** that take a user identity always go through [`lib/api/with-auth.ts`](lib/api/with-auth.ts). The proxy excludes `/api/`, so `withAuth` is the only way to trust `x-user-id` downstream.
- **Server actions** live next to the feature in `features/<area>/server/*.ts`; thin route shims live in `app/api/...` and just enforce auth/ratelimit/idempotency before delegating.
- **Errors** flow through `AppError` → `handleRouteError` → `logError`. Don't hand-roll error JSON.
- **Rate limit / idempotency** wrappers compose outside-in: `withAuth(withRateLimit(withIdempotency(handler, idem), rate))`.
- **Database changes** are migrations under `supabase/migrations/` — never edit `types/database.types.ts` by hand. Use the `createUntypedAdminClient()` shim only for tables/columns that haven't been picked up by `pnpm db:typegen` yet.

## Deployment

- Vercel auto-deploys `main` and Preview URLs for every PR.
- Cron jobs are declared in [`vercel.json`](vercel.json) and gated by `VERCEL_CRON_SECRET` (see `lib/api/cron.ts`).
- `instrumentation.ts` initialises Sentry per runtime (Node + Edge).
- The Inngest endpoint is `/api/webhooks/inngest`; signing-key verification requires `INNGEST_SIGNING_KEY` to be set.

## Documentation

- [`/docs/00-overview.md`](../docs/00-overview.md) – product + architectural overview
- [`/docs/01-auth.md`](../docs/01-auth.md) – auth flows
- [`/docs/02-database.md`](../docs/02-database.md) – schema and RLS design
- [`/docs/03-profiles-feed.md`](../docs/03-profiles-feed.md) – profile + feed
- [`/docs/04-chat-realtime.md`](../docs/04-chat-realtime.md) – chat
- [`/docs/06-image-processing.md`](../docs/06-image-processing.md) and [`13-photo-variants.md`](../docs/13-photo-variants.md) – photo pipeline
- [`/docs/07-infrastructure.md`](../docs/07-infrastructure.md) – Vercel/Sentry/cron infra
- [`/docs/09-error-handling.md`](../docs/09-error-handling.md) – error contract
- [`/docs/10-rate-limiting.md`](../docs/10-rate-limiting.md) – rate-limit policy
- [`/docs/11-idempotency.md`](../docs/11-idempotency.md) – idempotency contract
- [`/docs/12-notifications.md`](../docs/12-notifications.md) – notifications
