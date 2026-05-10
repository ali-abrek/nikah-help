import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// These tests run against a real Postgres / Supabase. They're skipped when
// the env vars below are absent so `pnpm test:ci` (which has no Supabase
// linked) doesn't fail. To run them locally:
//
//   supabase start
//   TEST_SUPABASE_URL=http://127.0.0.1:54321 \
//   TEST_SUPABASE_SECRET_KEY=$(supabase status -o json | jq -r .service_role_key) \
//     pnpm vitest run tests/integration/database
//
// Or against a branch DB:
//   TEST_SUPABASE_URL=https://<branch-ref>.supabase.co \
//   TEST_SUPABASE_SECRET_KEY=<service_role_key> \
//     pnpm vitest run tests/integration/database

export function dbAvailable(): boolean {
  return Boolean(process.env.TEST_SUPABASE_URL && process.env.TEST_SUPABASE_SECRET_KEY)
}

export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Bootstrap a fresh authenticated user against a running Supabase Auth.
// Returns the user's id and a client scoped to their session via the access
// token, so RLS evaluates `auth.uid()` correctly.
export async function createTestUser(opts?: {
  gender?: 'male' | 'female'
  isPublished?: boolean
}): Promise<{
  id: string
  email: string
  client: SupabaseClient<Database>
}> {
  const admin = adminClient()
  const email = `test-${crypto.randomUUID()}@example.com`
  const password = 'test-password-' + crypto.randomUUID()

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr || !created.user) {
    throw new Error(`createUser failed: ${createErr?.message ?? 'no user'}`)
  }
  const id = created.user.id

  await admin.from('profiles').upsert({
    id,
    email,
    role: 'user',
    gender: opts?.gender ?? 'female',
    birth_date: '2000-01-01',
    is_published: opts?.isPublished ?? true,
    onboarding_completed: true,
  })

  // Sign in to obtain an access token.
  const userClient = createClient<Database>(
    process.env.TEST_SUPABASE_URL!,
    // Anon key is required for password sign-in. Tests need to supply it
    // separately because Supabase doesn't expose anon via the secret key.
    process.env.TEST_SUPABASE_ANON_KEY ?? process.env.TEST_SUPABASE_SECRET_KEY!,
  )
  const { data: signed, error: signErr } = await userClient.auth.signInWithPassword({
    email,
    password,
  })
  if (signErr || !signed.session) {
    throw new Error(`signIn failed: ${signErr?.message ?? 'no session'}`)
  }

  return { id, email, client: userClient }
}

export async function deleteTestUser(userId: string): Promise<void> {
  const admin = adminClient()
  await admin.auth.admin.deleteUser(userId)
}
