import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

// CSP applied at the edge by the proxy uses a per-request nonce, but a
// strict baseline lives here so static responses (HTML 4xx pages, etc.)
// still ship with sane defaults. The proxy may override.
const CSP_BASELINE = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "media-src 'self' blob: https://*.supabase.co",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
  // /monitoring is the Sentry tunnel route — same-origin, no extra entry needed.
  // https://*.ingest.sentry.io is kept for server-side SDK direct delivery
  // and as a fallback when the tunnel is unavailable.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.upstash.io https://*.ingest.sentry.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(self)' },
  { key: 'Content-Security-Policy', value: CSP_BASELINE },
  // HSTS only meaningful on HTTPS in production. Vercel terminates TLS in
  // front of us, so we always emit it; browsers ignore it on plain HTTP.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
]

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp'],
  images: {
    // Allow Supabase Storage public URLs through the optimizer. Restrict to
    // hostnames you actually publish from to prevent open-proxy abuse.
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: SECURITY_HEADERS,
    },
  ],
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Quiet locally; verbose in CI so upload failures fail the build.
  silent: !process.env.CI,

  // MVP: standard client file upload only. Enable widenClientFileUpload in
  // Phase 2 once source-map coverage requirements are validated.
  widenClientFileUpload: false,

  // Delete source maps from the build output after uploading to Sentry.
  // They're never served to browsers — only Sentry gets them for stack traces.
  sourcemaps: {
    filesToDeleteAfterUpload: ['.next/static/**/*.map'],
  },

  // Strip the Sentry SDK's internal logger from the client bundle.
  disableLogger: true,

  // Proxy browser events through our domain to bypass ad-blockers.
  // The /monitoring path is excluded from auth middleware (see proxy.ts).
  tunnelRoute: '/monitoring',

  // Annotate React components in traces for richer debugging context.
  reactComponentAnnotation: { enabled: true },
})
