import { createAdminClient } from '@/lib/supabase/admin'

export interface LikeProfile {
  id: string
  name: string | null
  gender: string | null
  age: number | null
  city: string | null
  country: string | null
  photo_url: string | null
  liked_at: string
}

const DEFAULT_LIMIT = 20

export async function getLikedByProfiles(
  userId: string,
  opts?: { cursor?: string; limit?: number },
): Promise<{ data: LikeProfile[]; nextCursor: string | null }> {
  const supabase = createAdminClient()
  const limit = opts?.limit ?? DEFAULT_LIMIT

  let query = supabase
    .from('likes')
    .select(
      `
      from_user_id,
      created_at,
      profiles:from_user_id (
        id, name, gender, birth_date, city, country,
        photos ( variants )
      )
    `,
    )
    .eq('to_user_id', userId)
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

  const data = page.map((row: Record<string, unknown>) => {
    const profile = (row.profiles as Record<string, unknown>) ?? {}
    const photos = (profile.photos as Array<Record<string, unknown>>) ?? []
    const firstPhoto = photos[0]
    const variants = (firstPhoto?.variants as Record<string, Record<string, string>> | null) ?? null
    const photoUrl = variants?.thumbnail_sm?.webp ?? null
    const birthDate = profile.birth_date as string | null

    return {
      id: profile.id as string,
      name: profile.name as string | null,
      gender: profile.gender as string | null,
      age: birthDate ? calcAgeFromDate(birthDate) : null,
      city: profile.city as string | null,
      country: profile.country as string | null,
      photo_url: photoUrl,
      liked_at: row.created_at as string,
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
