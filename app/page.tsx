import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { GuestLanding } from '@/features/auth/components/guest-landing'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()

  if (data?.claims) {
    redirect('/feed')
  }

  const { error } = await searchParams
  return <GuestLanding callbackError={error} />
}
