import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { FeedFilterValues, FeedPage, FeedProfile } from '../schemas'
import { getViewerLocation, radiusSearch } from './radius-search'

export interface QueryFeedParams {
  supabase: SupabaseClient<Database>
  viewerId: string
  viewerGender: 'male' | 'female'
  filters?: FeedFilterValues
  cursor?: string
  limit?: number
}

export async function queryFeed({
  supabase,
  viewerId,
  viewerGender,
  filters = {},
  cursor,
  limit = 20,
}: QueryFeedParams): Promise<FeedPage> {
  const oppositeGender = viewerGender === 'male' ? 'female' : 'male'

  let query = supabase
    .from('profiles')
    .select(
      `
      id,
      name,
      gender,
      birth_date,
      country,
      city,
      ai_bio,
      marital_status,
      children_count,
      created_at,
      photos!inner(id, variants, position, moderation_status)
    `,
      { count: 'exact' },
    )
    .eq('gender', oppositeGender)
    .eq('is_published', true)
    .eq('photos.moderation_status', 'approved')
    .eq('photos.position', 1)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  // Cursor-based pagination
  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  // Age filters: convert age range to birth_date range
  if (filters.age_min != null || filters.age_max != null) {
    const now = new Date()
    if (filters.age_max != null) {
      const minBirth = new Date(
        now.getFullYear() - (filters.age_max + 1),
        now.getMonth(),
        now.getDate() + 1,
      )
      query = query.gte('birth_date', minBirth.toISOString().split('T')[0]!)
    }
    if (filters.age_min != null) {
      const maxBirth = new Date(
        now.getFullYear() - filters.age_min,
        now.getMonth(),
        now.getDate(),
      )
      query = query.lte('birth_date', maxBirth.toISOString().split('T')[0]!)
    }
  }

  // Marital status filter
  if (filters.marital_status && filters.marital_status.length > 0) {
    query = query.in('marital_status', filters.marital_status)
  }

  // Children count filter
  if (filters.children_count_max != null) {
    query = query.lte('children_count', filters.children_count_max)
  }

  // Gender-specific filters (searches for the OPPOSITE gender)
  if (oppositeGender === 'female') {
    if (filters.polygyny_attitude && filters.polygyny_attitude.length > 0) {
      query = query.in('polygyny_attitude', filters.polygyny_attitude)
    }
    if (filters.hijab_attitude && filters.hijab_attitude.length > 0) {
      query = query.in('hijab_attitude', filters.hijab_attitude)
    }
  } else {
    if (filters.income_level && filters.income_level.length > 0) {
      query = query.in('income_level', filters.income_level)
    }
    if (filters.housing && filters.housing.length > 0) {
      query = query.in('housing', filters.housing)
    }
    if (filters.education && filters.education.length > 0) {
      query = query.in('education', filters.education)
    }
  }

  // Radius search — filter by geographic distance if viewer has location
  if (filters.radius_km != null) {
    const viewerLoc = await getViewerLocation(supabase, viewerId)
    if (viewerLoc) {
      const nearby = await radiusSearch(
        supabase,
        viewerLoc.longitude,
        viewerLoc.latitude,
        filters.radius_km,
      )
      const nearbyIds = nearby.map((n) => n.profile_id)
      if (nearbyIds.length > 0) {
        query = query.in('id', nearbyIds)
      } else {
        return { profiles: [], nextCursor: null }
      }
    }
  }

  const { data, error } = await query

  if (error) throw error

  const profiles = (data ?? []) as FeedProfileRaw[]
  const hasMore = profiles.length > limit
  const page = hasMore ? profiles.slice(0, limit) : profiles

  return {
    profiles: page.map((p) => toFeedProfile(p)),
    nextCursor: hasMore ? (page[page.length - 1]?.created_at ?? null) : null,
  }
}

// ── Raw DB row ─────────────────────────────────────────────────────

interface FeedProfileRaw {
  id: string
  name: string | null
  gender: 'male' | 'female' | null
  birth_date: string | null
  country: string | null
  city: string | null
  ai_bio: string | null
  marital_status: string | null
  children_count: number | null
  created_at: string | null
  photos: {
    id: string
    variants: Record<string, { avif: string; webp: string }> | null
    position: number
    moderation_status: string
  }[]
}

function toFeedProfile(raw: FeedProfileRaw): FeedProfile {
  const photo = raw.photos?.[0]
  const variants = photo?.variants as Record<string, { avif: string; webp: string }> | null
  const coverPath = variants?.cover?.webp ?? variants?.cover_blurred?.webp ?? null

  return {
    id: raw.id,
    name: raw.name ?? '',
    gender: (raw.gender as 'male' | 'female') ?? 'male',
    birth_date: raw.birth_date ?? '',
    country: raw.country,
    city: raw.city,
    ai_bio: raw.ai_bio,
    marital_status: raw.marital_status,
    children_count: raw.children_count,
    cover_photo_url: coverPath,
    created_at: raw.created_at ?? '',
  }
}
