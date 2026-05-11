// Browser-side Sentry initialisation.
// Next.js 16 + Turbopack load this file instead of sentry.client.config.ts.
// Keep this file free of server-only imports.
import * as Sentry from '@sentry/nextjs'
import { scrubPii } from '@/lib/sentry/scrub'

const env = process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: env,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  sendDefaultPii: false,

  tracesSampleRate: env === 'production' ? 0.05 : 1.0,

  // Replay: 1% of normal sessions, 100% of sessions with an error in prod.
  // Disabled entirely in development to avoid local noise.
  replaysSessionSampleRate: env === 'production' ? 0.01 : env === 'staging' ? 0.1 : 0,
  replaysOnErrorSampleRate: env === 'development' ? 0 : 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      // No networkDetailAllowUrls — do not capture request/response bodies.
      networkDetailAllowUrls: [],
    }),
  ],

  // Filter out browser-extension errors and known third-party noise.
  denyUrls: [
    /extensions\//i,
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /googletagmanager\.com/i,
    /mc\.yandex\.ru/i,
    /yandex\.ru\/i/i,
  ],

  beforeSend: scrubPii,
})

// Required by @sentry/nextjs to instrument App Router navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
