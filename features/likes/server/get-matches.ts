import { createAdminClient } from '@/lib/supabase/admin'

export interface MatchProfile {
  id: string
  name: string | null
  gender: string | null
  age: number | null
  city: string | null
  country: string | null
  photo_url: string | null
  match_id: string
  matched_at: string | null
}

const DEFAULT_LIMIT = 20

export async function getMatches(
  userId: string,
  opts?: { cursor?: string; limit?: number },
): Promise<{ data: MatchProfile[]; nextCursor: string | null }> {
  const supabase = createAdminClient()
  const limit = opts?.limit ?? DEFAULT_LIMIT

  let query = supabase
    .from('matches')
    .select('id, user_a, user_b, created_at')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (opts?.cursor) {
    query = query.lt('created_at', opts.cursor)
  }

  const { data: rows } = await query

  if (!rows?.length) return { data: [], nextCursor: null }

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? (page.at(-1)!.created_at as string) : null

  const otherUserIds = page.map((m) => (m.user_a === userId ? m.user_b : m.user_a))

  const { data: profiles } = await supabase
    .from('profiles')
    .select(
      `
      id, name, gender, birth_date, city, country,
      photos ( variants )
    `,
    )
    .in('id', otherUserIds)

  const profileMap = new Map(
    (profiles ?? []).map((p: Record<string, unknown>) => [p.id as string, p]),
  )

  const data = page.map((m) => {
    const otherId = m.user_a === userId ? m.user_b : m.user_a
    const profile = profileMap.get(otherId) ?? {}
    const photos = (profile.photos as Array<Record<string, unknown>>) ?? []
    const firstPhoto = photos[0]
    const variants = (firstPhoto?.variants as Record<string, Record<string, string>> | null) ?? null
    const photoUrl = variants?.thumbnail_sm?.webp ?? null
    const birthDate = profile.birth_date as string | null

    return {
      id: otherId,
      name: profile.name as string | null,
      gender: profile.gender as string | null,
      age: birthDate ? calcAgeFromDate(birthDate) : null,
      city: profile.city as string | null,
      country: profile.country as string | null,
      photo_url: photoUrl,
      match_id: m.id,
      matched_at: m.created_at,
    }
  })

  return { data, nextCursor }
}

function calcAgeFromDate(birthDate: string): number {
  const birth = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}
