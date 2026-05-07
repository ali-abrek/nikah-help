// Resolve a server env var, accepting an optional list of fallback names so
// the same Supabase/Upstash credentials can be picked up whether they're
// provisioned with or without the NEXT_PUBLIC_ prefix.
function resolve(...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = process.env[key]
    if (val) return val
  }
  return undefined
}

const ENV_RESOLVERS = {
  SUPABASE_URL: () => resolve('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_PUBLISHABLE_KEY: () =>
    resolve('SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  SUPABASE_SECRET_KEY: () => resolve('SUPABASE_SECRET_KEY'),
  UPSTASH_REDIS_REST_URL: () => resolve('UPSTASH_REDIS_REST_URL'),
  UPSTASH_REDIS_REST_TOKEN: () => resolve('UPSTASH_REDIS_REST_TOKEN'),
} as const

type ResolvedEnvKey = keyof typeof ENV_RESOLVERS

const REQUIRED_SERVER_VARS = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const satisfies readonly ResolvedEnvKey[]

let validated = false

export function validateEnv(): void {
  if (validated) return
  validated = true

  const missing: string[] = []
  for (const key of REQUIRED_SERVER_VARS) {
    if (!ENV_RESOLVERS[key]()) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    // Logged but not thrown: a single missing var (e.g. UPSTASH) shouldn't
    // bring down the whole middleware module. Each call site re-validates
    // via requireEnv() and surfaces a targeted error.
    console.error(
      `[env] Missing required environment variables: ${missing.join(', ')}`,
    )
  }
}

export function requireEnv(key: string): string {
  const val = key in ENV_RESOLVERS
    ? ENV_RESOLVERS[key as ResolvedEnvKey]()
    : process.env[key]
  if (!val) {
    throw new Error(`[env] Missing required environment variable: ${key}`)
  }
  return val
}
