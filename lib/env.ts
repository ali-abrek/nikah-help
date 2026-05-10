// Environment-variable resolution and validation.
//
// Two tiers of variables:
//
//   BOOT_REQUIRED — without these, the application cannot serve a single
//                   request meaningfully. validateEnv() throws on missing.
//   FEATURE_REQUIRED — surfaced lazily via requireEnv() at the call site so
//                      a missing optional integration (e.g. Resend) does
//                      not bring the whole process down.
//
// Each variable can have multiple resolver names (e.g. some platforms inject
// `NEXT_PUBLIC_*` mirrors); we accept the first non-empty value.

function resolve(...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = process.env[key]
    if (val) return val
  }
  return undefined
}

const ENV_RESOLVERS = {
  // Boot-required
  SUPABASE_URL: () => resolve('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_PUBLISHABLE_KEY: () =>
    resolve('SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  SUPABASE_SECRET_KEY: () => resolve('SUPABASE_SECRET_KEY'),
  UPSTASH_REDIS_REST_URL: () => resolve('UPSTASH_REDIS_REST_URL'),
  UPSTASH_REDIS_REST_TOKEN: () => resolve('UPSTASH_REDIS_REST_TOKEN'),
  INNGEST_SIGNING_KEY: () => resolve('INNGEST_SIGNING_KEY'),
  BLOCKED_EMAIL_PEPPER: () => resolve('BLOCKED_EMAIL_PEPPER'),

  // Feature-required (read on demand)
  INNGEST_EVENT_KEY: () => resolve('INNGEST_EVENT_KEY'),
  OPENAI_API_KEY: () => resolve('OPENAI_API_KEY'),
  RESEND_API_KEY: () => resolve('RESEND_API_KEY'),
  RESEND_FROM_ADDRESS: () => resolve('RESEND_FROM_ADDRESS'),
  VAPID_EMAIL: () => resolve('VAPID_EMAIL'),
  VAPID_PUBLIC_KEY: () => resolve('VAPID_PUBLIC_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
  VAPID_PRIVATE_KEY: () => resolve('VAPID_PRIVATE_KEY'),
  VERCEL_CRON_SECRET: () => resolve('VERCEL_CRON_SECRET'),
  SENTRY_DSN: () => resolve('SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN'),
  SENTRY_AUTH_TOKEN: () => resolve('SENTRY_AUTH_TOKEN'),
} as const

type ResolvedEnvKey = keyof typeof ENV_RESOLVERS

const BOOT_REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const satisfies readonly ResolvedEnvKey[]

let validated = false

// Skip strict validation during `next build`: the Next 16 build phase imports
// modules to discover routes and would otherwise force CI to provision every
// secret. Runtime invocations (proxy, route handlers) still validate.
function isBuildPhase(): boolean {
  return (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.NEXT_PHASE === 'phase-development-build'
  )
}

export function validateEnv(): void {
  if (validated) return
  validated = true
  if (isBuildPhase()) return

  const missing: string[] = []
  for (const key of BOOT_REQUIRED) {
    if (!ENV_RESOLVERS[key]()) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    const message =
      `[env] Missing boot-required environment variables: ${missing.join(', ')}. ` +
      `Set them before starting the server.`
    // Throw rather than log: a missing core secret means auth, rate-limit,
    // background jobs, or email-block hashing won't function safely.
    throw new Error(message)
  }
}

export function requireEnv(key: string): string {
  const val = key in ENV_RESOLVERS ? ENV_RESOLVERS[key as ResolvedEnvKey]() : process.env[key]
  if (!val) {
    throw new Error(`[env] Missing required environment variable: ${key}`)
  }
  return val
}

export function getEnv(key: ResolvedEnvKey | string): string | undefined {
  return key in ENV_RESOLVERS ? ENV_RESOLVERS[key as ResolvedEnvKey]() : process.env[key]
}
