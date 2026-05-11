# Sentry Integration Guide

Nikah Help uses `@sentry/nextjs` for centralized error tracking, performance monitoring, and release health. This guide covers local setup, how to report errors correctly, and deployment configuration.

See `docs/14-sentry-observability.md` for the canonical requirements and operational standards (alert routing, ownership rules, severity rubric, deployment gates). This guide is the developer-facing how-to.

Key sections in the canonical doc:
- **Layered `lib/sentry/` Architecture** — centralized module design, boundaries, call sites
- **Standardized Helper Patterns** — `captureSentryException`, `withSentryMonitor`, `setSentryUser`
- **Mandatory Observability Principles** — no silent failures, centralized helpers, no ad-hoc usage, structured errors, flow taxonomy, severity normalization
- **Typed Flow Taxonomy System** — `FlowTag` union, naming conventions, extension strategy
- **Four-Layer PII Protection Strategy** — `sendDefaultPii`, `scrubPii`, Replay masking, `setSentryUser` contract
- **Replay & Tracing Strategy** — sampling, `denyUrls`, bundle-size optimization, tunnel route
- **Environment Configuration** — Vercel integration, source maps, release tracking, CI/CD
- **Intentionally Deferred Items** — Phase 2/3 deferral rationale and current guarantees

---

## Required Environment Variables

| Variable | Required for | Description |
|---|---|---|
| `SENTRY_DSN` | Server + Edge runtime | Project DSN — server-only |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser client | Project DSN — safe to expose publicly |
| `NEXT_PUBLIC_SENTRY_ENV` | All runtimes | `production` / `staging` / `development` |
| `SENTRY_AUTH_TOKEN` | Build time only | Source map upload — never at runtime |
| `SENTRY_ORG` | Build time only | Sentry organization slug |
| `SENTRY_PROJECT` | Build time only | Sentry project slug |
| `SENTRY_RELEASE` | Auto-injected by Vercel | `nikah-help@<git-sha>` |
| `NEXT_PUBLIC_SENTRY_RELEASE` | Auto-injected by Vercel | Same value, accessible in browser bundle |

Add these to your `.env.local` (copy from `.env.example`). Leaving `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` empty disables Sentry locally — all helpers no-op cleanly, so local development works without a project.

---

## Local Development

Sentry is **opt-in** locally. If `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are absent (the default), all capture helpers silently no-op and nothing is sent. To test Sentry locally:

1. Create or locate your Sentry project.
2. Copy the DSN from **Project Settings → Client Keys (DSN)**.
3. Add to `.env.local`:
   ```
   SENTRY_DSN=https://xxx@oN.ingest.sentry.io/yyy
   NEXT_PUBLIC_SENTRY_DSN=https://xxx@oN.ingest.sentry.io/yyy
   NEXT_PUBLIC_SENTRY_ENV=development
   ```
4. Run `pnpm dev`. Errors will appear in your Sentry project under the `development` environment.

Do not use the production DSN locally. Filter alerts to `environment:production` in Sentry to avoid noise from dev/staging.

---

## How to Report an Error

Import from `lib/sentry` — never import `@sentry/nextjs` directly in application code.

### Server / Edge / Inngest

```ts
import { captureSentryException } from '@/lib/sentry'

try {
  await doSomething()
} catch (err) {
  void captureSentryException(err, {
    flow: 'payments.init',       // required — pick from FlowTag union
    severity: 'error',           // optional, default 'error'
    tags: { step: 'init_call' }, // optional key/value strings
    extra: { provider: 'tbank' } // optional typed SentryExtra
  })
  throw err  // or convert to AppError
}
```

### Client components

Same import and API — `captureSentryException` works in browser code (it resolves the client DSN automatically).

```ts
'use client'
import { captureSentryException } from '@/lib/sentry'
```

### AppError / logError chain (automatic)

Any `AppError` with `status >= 500` that passes through `logError` (via `handleRouteError` or `handleActionError`) is **automatically** reported. You do not need to call `captureSentryException` separately for these.

The `logError` function derives a `flow` tag from the error code automatically (e.g. `PHOTO_PROCESSING_FAILED` → `flow=image.process`). For error codes not in the mapping, the event still lands in Sentry — it just won't match flow-specific alert rules until Phase 2.

---

## Adding a New Flow

1. Add the new literal to the `FlowTag` union in `lib/sentry/types.ts`.
2. Document the suffix convention inline (see the comment in `types.ts`).
3. If the flow is from an `AppError` code, add the code → flow mapping in `lib/sentry/capture.ts` (`CODE_TO_FLOW`).
4. Add an ownership rule in Sentry project settings for the new `flow` tag prefix.

---

## Wrapping a New Cron Job

```ts
import { withSentryMonitor } from '@/lib/sentry/monitor'

async function handler(request: NextRequest): Promise<NextResponse> {
  // ... existing logic
}

// slug convention: cron.<vercel-route-slug>
// schedule: crontab string matching vercel.json
export const GET = withSentryMonitor('cron.my-new-job', handler, '0 4 * * *')
```

Add the corresponding entry to `vercel.json` crons. The monitor slug must match `cron.<slug>` exactly for alert routing to work.

---

## Deployment Configuration

### Vercel ↔ Sentry Integration

Install the official Vercel ↔ Sentry integration at the project level. This:
- Creates a new Sentry release on every deploy
- Injects `SENTRY_RELEASE` and `NEXT_PUBLIC_SENTRY_RELEASE` automatically
- Sets `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, and `NEXT_PUBLIC_SENTRY_ENV` per environment

Once the integration is installed, do **not** manually set DSNs in Vercel project settings except for hotfix scenarios.

### Build-time variables (set in Vercel project settings)

```
SENTRY_AUTH_TOKEN   # Scoped token: project:releases + project:write only
SENTRY_ORG          # e.g. nikah-help
SENTRY_PROJECT      # e.g. nikah-help-web
```

Source maps are uploaded automatically during `next build` by `withSentryConfig` in `next.config.ts`. The build fails in CI if upload fails on a production deploy (`silent: !process.env.CI`).

### Environment mapping

| Vercel target | `NEXT_PUBLIC_SENTRY_ENV` | Tracing | Replay |
|---|---|---|---|
| Production | `production` | 0.10 server / 0.05 client / 0.02 edge | 1% session / 100% on-error |
| Preview | `staging` | 1.0 all | 10% / 100% |
| Development (local) | `development` | 1.0 | disabled |

---

## Verifying Source Maps

After a staging or production deploy:

1. Open a Sentry issue from that release.
2. Check that the stack trace shows readable TypeScript filenames and line numbers (not minified bundle hashes).
3. If the stack trace is minified: check that `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` were set at build time, and that the build log shows `[sentry] Uploading source maps...` without errors.

---

## Troubleshooting

**Tunnel returns 404 in the browser**
- Verify `/monitoring` is in `tunnelRoute` in `next.config.ts`.
- Verify `/monitoring` is excluded from the proxy matcher in `proxy.ts`.
- The tunnel is a built-in Next.js SDK route — no custom handler needed.

**No events appearing in Sentry locally**
- Check that `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set in `.env.local`.
- Check the browser Network tab for requests to `/monitoring` — they should return 200.
- Verify `NEXT_PUBLIC_SENTRY_ENV` is not `production` locally (production events go to production quota).

**DSN missing / events not sent**
- `captureSentryException` and all helpers no-op when DSN is absent — this is intentional for local dev.
- In production/staging, DSN should be injected by the Vercel ↔ Sentry integration.

**Source maps not appearing**
- Confirm `SENTRY_AUTH_TOKEN` is set as a build-time env var in Vercel (not runtime).
- Check the Vercel build log for `[sentry]` lines.
- `hideSourceMaps: true` means source maps are sent to Sentry only, not the browser — this is correct.

**Edge runtime crash not appearing**
- Edge functions must use the dynamic import pattern (`await import('@sentry/nextjs')`) — static imports of Node-only modules will break the edge bundle.
- `sentry.edge.config.ts` has no Node-only integrations — keep it that way.

---

## Debugging Workflow

1. Open the issue in Sentry. Read the **stack trace**, **breadcrumbs**, **tags** (`flow`, `error_code`), and **release**.
2. If a session replay exists, watch the last 30 s before the error.
3. Click through to the **distributed trace** — confirm whether the failing span is upstream (Supabase, T-Bank, OpenAI) or in our code.
4. Check **Release Health** for the affected release — if crash-free users dropped, escalate.
5. Reproduce locally using the request payload (PII is scrubbed in the event).
6. Land a fix on a branch. The PR description must link the Sentry issue. Resolve the issue via "Resolve in next release" — never "Resolve" alone.

---

## Alert Recommendations

Configure these alert rules in Sentry (scope all to `environment:production`):

| Trigger | Channel | Action |
|---|---|---|
| Any new `fatal` issue | `#alerts-prod` + PagerDuty | Page on-call |
| Crash-free users < 99.5% over 30 min | `#alerts-prod` + PagerDuty | Page on-call |
| `flow=payments.*` errors > 5 in 5 min | `#alerts-prod` + `#payments` | Page on-call |
| `flow=auth.callback` error rate > 2% over 10 min | `#alerts-prod` | Notify on-call |
| `flow=realtime.channel` error rate > 5% per minute | `#chat` | Notify channel owner |
| `flow=ratelimit.infra` any occurrence | `#alerts-prod` | Notify on-call |
| `flow=cron.*` missed run (Sentry Crons) | `#alerts-prod` | Notify on-call |
| `error_code=SYSTEM_DATABASE_ERROR` > 5 in 10 min | `#alerts-prod` + `#database` | Page on-call |
| New issue in latest release | `#release-watch` | Informational |
