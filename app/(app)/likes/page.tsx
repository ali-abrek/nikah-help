import { createServerSupabase } from '@/lib/supabase/server'
import { getLikedByProfiles } from '@/features/likes/server/get-liked-by'
import { getLikedProfiles } from '@/features/likes/server/get-liked'
import { getMatches } from '@/features/likes/server/get-matches'
import { LikesTabs } from '@/features/likes/components/LikesTabs'
import { getUserId } from '@/lib/auth/claims'

export default async function LikesPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-500">Требуется авторизация</p>
      </div>
    )
  }

  const userId = getUserId(data.claims as Record<string, unknown>)
  if (!userId) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-500">Требуется авторизация</p>
      </div>
    )
  }

  const [incoming, outgoing, matches] = await Promise.all([
    getLikedByProfiles(userId),
    getLikedProfiles(userId),
    getMatches(userId),
  ])

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-foreground">Лайки и мэтчи</h1>
      <LikesTabs incoming={incoming} outgoing={outgoing} matches={matches} />
    </div>
  )
}
