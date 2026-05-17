import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { AppError } from '@/lib/errors/app-error'

export const BIO_DAILY_LIMIT = 2
const WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Reserve one AI bio regeneration slot for the user inside a rolling 24h
 * window. Throws `BIO_RATE_LIMITED` when the quota is exhausted so callers
 * can short-circuit before paying for an OpenAI call.
 *
 * Read-then-write is acceptable here because the regenerate path is
 * protected by `ai_bio_status='regenerating'` which serializes concurrent
 * attempts for the same user.
 */
export async function reserveBioRegenSlot(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .select('ai_bio_regen_count, ai_bio_regen_window_start')
    .eq('id', userId)
    .single<{ ai_bio_regen_count: number | null; ai_bio_regen_window_start: string | null }>()

  if (error || !data) throw error ?? new Error('Profile not found')

  const now = Date.now()
  const windowStart = data.ai_bio_regen_window_start
    ? new Date(data.ai_bio_regen_window_start).getTime()
    : 0
  const withinWindow = windowStart > 0 && now - windowStart < WINDOW_MS
  const currentCount = withinWindow ? (data.ai_bio_regen_count ?? 0) : 0

  if (currentCount >= BIO_DAILY_LIMIT) {
    throw new AppError('BIO_RATE_LIMITED')
  }

  const nextCount = currentCount + 1
  const nextWindowStart = withinWindow
    ? (data.ai_bio_regen_window_start ?? new Date(now).toISOString())
    : new Date(now).toISOString()

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      ai_bio_regen_count: nextCount,
      ai_bio_regen_window_start: nextWindowStart,
    })
    .eq('id', userId)

  if (updateError) throw updateError
}
