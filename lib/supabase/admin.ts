import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { requireEnv } from '@/lib/env'

export const createAdminClient = () =>
  createClient<Database>(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
