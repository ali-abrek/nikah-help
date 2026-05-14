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
    // (created_at, id) gives a strict total order, so callers can't see
    // duplicates or skips when multiple profiles share a timestamp.
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  // Cursor-based pagination. Cursor format: "<created_at>|<id>". Older clients
  // sending only "<created_at>" still work — we degrade to a coarse filter.
  if (cursor) {
    const [cAt, cId] = cursor.split('|')
    if (cAt && cId) {
      // Composite cursor: same timestamp, lower id; OR strictly older timestamp.
      query = query.or(`and(created_at.eq.${cAt},id.lt.${cId}),created_at.lt.${cAt}`)
    } else if (cAt) {
      query = query.lt('created_at', cAt)
    }
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
      const maxBirth = new Date(now.getFullYear() - filters.age_min, now.getMonth(), now.getDate())
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
  const ids = page.map((p) => p.id)

  // Annotate each card with the viewer's interaction state in two batched
  // queries (one for likes-out, one for matches involving the viewer). This
  // avoids the N+1 the client would otherwise do when rendering the feed.
  const [likedIds, matchedIds] = await Promise.all([
    fetchLikedIds(supabase, viewerId, ids),
    fetchMatchedIds(supabase, viewerId, ids),
  ])

  return {
    profiles: page.map((p) => toFeedProfile(p, likedIds.has(p.id), matchedIds.has(p.id))),
    nextCursor: hasMore ? buildCursor(page[page.length - 1]) : null,
  }
}

function buildCursor(row: FeedProfileRaw | undefined): string | null {
  if (!row?.created_at || !row.id) return null
  return `${row.created_at}|${row.id}`
}

async function fetchLikedIds(
  supabase: SupabaseClient<Database>,
  viewerId: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data } = await supabase
    .from('likes')
    .select('to_user_id')
    .eq('from_user_id', viewerId)
    .in('to_user_id', ids)
  return new Set((data ?? []).map((row) => row.to_user_id))
}

async function fetchMatchedIds(
  supabase: SupabaseClient<Database>,
  viewerId: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  // matches(user_a, user_b) is canonicalised by LEAST/GREATEST, so the viewer
  // can sit on either side. Filter to rows where the viewer participates and
  // the partner is in our page slice; fold the partner id into a Set.
  const { data } = await supabase
    .from('matches')
    .select('user_a, user_b')
    .or(`user_a.eq.${viewerId},user_b.eq.${viewerId}`)
  const matched = new Set<string>()
  for (const row of data ?? []) {
    const partner = row.user_a === viewerId ? row.user_b : row.user_a
    if (ids.includes(partner)) matched.add(partner)
  }
  return matched
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

function toFeedProfile(
  raw: FeedProfileRaw,
  viewerHasLiked: boolean,
  isMatched: boolean,
): FeedProfile {
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
    viewer_has_liked: viewerHasLiked,
    is_matched: isMatched,
  }
}
