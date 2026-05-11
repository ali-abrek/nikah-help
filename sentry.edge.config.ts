import * as Sentry from '@sentry/nextjs'
import { scrubPii } from '@/lib/sentry/scrub'

// Edge runtime: minimal config only — no Replay, no Node-only integrations.
// Keep this file free of any Node.js API imports.
const env = process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: env,
  release: process.env.SENTRY_RELEASE,
  sendDefaultPii: false,
  tracesSampleRate: env === 'production' ? 0.02 : 1.0,
  beforeSend: scrubPii,
  beforeSendTransaction: scrubPii,
})
