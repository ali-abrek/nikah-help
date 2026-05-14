import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export interface ProfileDetailData {
  id: string
  name: string | null
  gender: 'male' | 'female' | null
  birth_date: string | null
  country: string | null
  city: string | null
  nationality: string | null
  height: number | null
  weight: number | null
  marital_status: string | null
  children_count: number | null
  education: string | null
  income_level: string | null
  housing: string | null
  willing_to_relocate: string | null
  polygyny_attitude: string | null
  hijab_attitude: string | null
  about_self: string | null
  ai_bio: string | null
  is_published: boolean | null
  last_seen_at: string | null
  photos: ProfilePhotoData[]
  viewer_has_liked: boolean
  viewer_is_match: boolean
  viewer_is_blocked: boolean
}

export interface ProfilePhotoData {
  id: string
  position: number
  variants: Record<string, { avif: string; webp: string }> | null
  moderation_status: string
}

export async function getProfile(
  supabase: SupabaseClient<Database>,
  profileId: string,
  viewerId: string,
): Promise<ProfileDetailData | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select(
      `
      id, name, gender, birth_date, country, city, nationality,
      height, weight, marital_status, children_count, education,
      income_level, housing, willing_to_relocate, polygyny_attitude,
      hijab_attitude, about_self, ai_bio, is_published, last_seen_at
    `,
    )
    .eq('id', profileId)
    .single()

  if (error || !profile) return null

  const isOwnProfile = viewerId === profileId

  // Run photo, like, match, and block checks in parallel
  const [photosRes, likeRes, matchRes, blockRes] = await Promise.all([
    isOwnProfile
      ? supabase
          .from('photos')
          .select('id, position, variants, moderation_status')
          .eq('profile_id', profileId)
          .neq('moderation_status', 'rejected')
          .order('position', { ascending: true })
      : supabase
          .from('photos')
          .select('id, position, variants, moderation_status')
          .eq('profile_id', profileId)
          .eq('moderation_status', 'approved')
          .order('position', { ascending: true }),
    supabase
      .from('likes')
      .select('id')
      .eq('from_user_id', viewerId)
      .eq('to_user_id', profileId)
      .maybeSingle(),
    supabase
      .from('matches')
      .select('id')
      .or(`user_a.eq.${viewerId},user_b.eq.${viewerId}`)
      .or(`user_a.eq.${profileId},user_b.eq.${profileId}`)
      .maybeSingle(),
    supabase
      .from('blocks')
      .select('id')
      .eq('blocker_id', viewerId)
      .eq('blocked_id', profileId)
      .maybeSingle(),
  ])

  return {
    ...profile,
    photos: (photosRes.data ?? []) as ProfilePhotoData[],
    viewer_has_liked: !!likeRes.data,
    viewer_is_match: !!matchRes.data,
    viewer_is_blocked: !!blockRes.data,
  }
}
