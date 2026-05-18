import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export async function togglePrivateMode(
  supabase: SupabaseClient<Database>,
  userId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ private_mode: enabled })
    .eq('id', userId)

  if (error) throw error
}
