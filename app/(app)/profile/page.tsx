import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'

export default async function OwnProfilePage() {
  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims ? ((claims as Record<string, unknown>).sub as string) : null

  if (!userId) {
    redirect('/auth')
  }

  redirect(`/profile/${userId}`)
}
