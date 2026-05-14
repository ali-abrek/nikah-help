import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth/claims'

export default async function OwnProfilePage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims ? getUserId(data.claims as Record<string, unknown>) : null

  if (!userId) {
    redirect('/auth')
  }

  redirect(`/profile/${userId}`)
}
