import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database.types'

type PreferenceRow = Database['public']['Tables']['notification_preferences']['Row']

export type PreferenceMap = Record<string, boolean>

const ALL_TYPES = [
  'like_received',
  'like_revoked',
  'match_created',
  'message_new',
  'photo_approved',
  'photo_rejected',
  'photo_removed_by_moderator',
  'account_blocked',
  'account_reinstated',
  'account_suspension_expired',
  'inactivity_warning',
] as const

export async function getPreferences(userId: string): Promise<PreferenceMap> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('notification_preferences')
    .select('type, enabled')
    .eq('user_id', userId)

  const map: PreferenceMap = {}
  // Default all to enabled
  for (const type of ALL_TYPES) {
    map[type] = true
  }
  // Override with stored preferences
  for (const row of (data ?? [])) {
    map[row.type] = row.enabled ?? true
  }

  return map
}

export async function setPreference(
  userId: string,
  type: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('notification_preferences').upsert(
    { user_id: userId, type, enabled },
    { onConflict: 'user_id, type' },
  )
}
