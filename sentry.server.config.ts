import * as Sentry from '@sentry/nextjs'
import { scrubPii } from '@/lib/sentry/scrub'

const env = process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: env,
  release: process.env.SENTRY_RELEASE,
  sendDefaultPii: false,

  // Always sample auth and photo processing in production so no critical
  // failure is under-represented; baseline is conservative (10%).
  tracesSampler: (ctx) => {
    const name = (ctx as { transactionContext?: { name?: string } }).transactionContext?.name ?? ''
    if (name.includes('/api/auth/callback') || name.includes('/api/photos/')) return 1.0
    return env === 'production' ? 0.1 : 1.0
  },

  tracePropagationTargets: [
    /^https:\/\/.*\.supabase\.co/,
    /^https?:\/\/localhost/,
    /^https?:\/\/127\.0\.0\.1/,
  ],

  beforeSend: scrubPii,
  beforeSendTransaction: scrubPii,
})
