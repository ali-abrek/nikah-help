import { createAdminClient } from '@/lib/supabase/admin'

export interface MatchProfile {
  id: string
  name: string | null
  gender: string | null
  age: number | null
  city: string | null
  photo_url: string | null
  match_id: string
  matched_at: string | null
}

export async function getMatches(userId: string): Promise<MatchProfile[]> {
  const supabase = createAdminClient()

  const { data: matches } = await supabase
    .from('matches')
    .select('id, user_a, user_b, created_at')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order('created_at', { ascending: false })

  if (!matches?.length) return []

  const otherUserIds = matches.map((m) => (m.user_a === userId ? m.user_b : m.user_a))

  const { data: profiles } = await supabase
    .from('profiles')
    .select(
      `
      id, name, gender, birth_date, city,
      photos ( variants )
    `,
    )
    .in('id', otherUserIds)

  const profileMap = new Map(
    (profiles ?? []).map((p: Record<string, unknown>) => [p.id as string, p]),
  )

  return matches.map((m) => {
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
      photo_url: photoUrl,
      match_id: m.id,
      matched_at: m.created_at,
    }
  })
}

function calcAgeFromDate(birthDate: string): number {
  const birth = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}
