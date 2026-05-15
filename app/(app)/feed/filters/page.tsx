import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth/claims'
import { FiltersScreen } from '@/features/feed/components/FiltersScreen'

export const metadata = { title: 'Фильтры — Nikah Help' }

export default async function FiltersPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const userId = getUserId((data?.claims ?? {}) as Record<string, unknown>)
  if (!userId) redirect('/auth')

  const { data: viewer } = await supabase
    .from('profiles')
    .select('gender')
    .eq('id', userId)
    .single()

  const gender: 'male' | 'female' = viewer?.gender === 'female' ? 'female' : 'male'

  return <FiltersScreen viewerGender={gender} />
}
