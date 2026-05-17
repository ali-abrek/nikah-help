import { createAdminClient } from '@/lib/supabase/admin'

export interface QueuedPhoto {
  photoId: string
  profileId: string
  profileName: string | null
  profileGender: 'male' | 'female' | null
  moderationReason: string | null
  createdAt: string | null
  scores: Record<string, unknown> | null
}

export async function listManualReviewQueue(limit = 50): Promise<QueuedPhoto[]> {
  const supabase = createAdminClient()
  // Oldest-first so the queue drains FIFO — fairer SLA than newest-first.
  const { data, error } = await supabase
    .from('photos')
    .select(
      `
        id,
        profile_id,
        moderation_reason,
        moderation_result,
        created_at,
        profiles!inner(name, gender)
      `,
    )
    .eq('moderation_status', 'manual_review')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw error
  if (!data) return []

  return data.map((row) => {
    const joined = row.profiles as
      | { name: string | null; gender: 'male' | 'female' | null }
      | { name: string | null; gender: 'male' | 'female' | null }[]
      | null
    const profile = Array.isArray(joined) ? (joined[0] ?? null) : joined

    return {
      photoId: row.id,
      profileId: row.profile_id,
      profileName: profile?.name ?? null,
      profileGender: profile?.gender ?? null,
      moderationReason: row.moderation_reason,
      createdAt: row.created_at,
      scores: (row.moderation_result as Record<string, unknown> | null) ?? null,
    }
  })
}
