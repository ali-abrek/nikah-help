import type { NextConfig } from 'next'

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

export default nextConfig
