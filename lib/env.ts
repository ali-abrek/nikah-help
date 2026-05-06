const REQUIRED_SERVER_VARS = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const

let validated = false

export function validateEnv(): void {
  if (validated) return
  validated = true

  const missing: string[] = []
  for (const key of REQUIRED_SERVER_VARS) {
    if (!process.env[key]) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    console.error(
      `[env] Missing required environment variables: ${missing.join(', ')}`,
    )
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing env vars: ${missing.join(', ')}`)
    }
  }
}

export function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) {
    throw new Error(`[env] Missing required environment variable: ${key}`)
  }
  return val
}
