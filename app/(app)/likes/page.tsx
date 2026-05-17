import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getLikedByProfiles } from '@/features/likes/server/get-liked-by'
import { getLikedProfiles } from '@/features/likes/server/get-liked'
import { getMatches } from '@/features/likes/server/get-matches'
import { LikesTabs } from '@/features/likes/components/LikesTabs'
import { getUserId } from '@/lib/auth/claims'
import { buildGenericTitle } from '@/lib/seo'

export const metadata = { title: buildGenericTitle('Симпатии', 'ru') }

export default async function LikesPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const userId = getUserId((data?.claims ?? {}) as Record<string, unknown>)
  if (!userId) redirect('/auth')

  const [incomingRes, outgoingRes, matchesRes] = await Promise.all([
    getLikedByProfiles(userId),
    getLikedProfiles(userId),
    getMatches(userId),
  ])

  return (
    <LikesTabs
      incoming={incomingRes.data}
      outgoing={outgoingRes.data}
      matches={matchesRes.data}
    />
  )
}
