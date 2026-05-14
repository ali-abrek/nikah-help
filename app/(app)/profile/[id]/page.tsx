import { notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getProfile } from '@/features/profile/server/get-profile'
import { ProfileDetail } from '@/features/profile/components/ProfileDetail'
import { getUserId } from '@/lib/auth/claims'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProfileDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const viewerId = data?.claims ? getUserId(data.claims as Record<string, unknown>) : null

  if (!viewerId) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-500">Требуется авторизация</p>
      </div>
    )
  }

  const profile = await getProfile(supabase, id, viewerId)

  if (!profile) {
    notFound()
  }

  const isOwnProfile = viewerId === id

  return (
    <div className="px-4 py-8">
      <ProfileDetail profile={profile} isOwnProfile={isOwnProfile} />
    </div>
  )
}
