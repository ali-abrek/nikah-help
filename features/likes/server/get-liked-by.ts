import { createAdminClient } from '@/lib/supabase/admin'

export interface LikeProfile {
  id: string
  name: string | null
  gender: string | null
  age: number | null
  city: string | null
  photo_url: string | null
  liked_at: string
}

export async function getLikedByProfiles(userId: string): Promise<LikeProfile[]> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('likes')
    .select(`
      from_user_id,
      created_at,
      profiles:from_user_id (
        id, name, gender, birth_date, city,
        photos ( variants )
      )
    `)
    .eq('to_user_id', userId)
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.map((row: Record<string, unknown>) => {
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
      photo_url: photoUrl,
      liked_at: row.created_at as string,
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
