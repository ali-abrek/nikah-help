import { notFound, redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getProfile } from '@/features/profile/server/get-profile'
import { ProfileDetail } from '@/features/profile/components/ProfileDetail'
import { OwnProfile } from '@/features/profile/components/OwnProfile'
import { getUserId } from '@/lib/auth/claims'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProfileDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const viewerId = data?.claims ? getUserId(data.claims as Record<string, unknown>) : null
  if (!viewerId) redirect('/auth')

  const profile = await getProfile(supabase, id, viewerId)
  if (!profile) notFound()

  if (viewerId === id) return <OwnProfile profile={profile} />
  return <ProfileDetail profile={profile} isOwnProfile={false} />
}
