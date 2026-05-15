import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth/claims'
import { FiltersScreen } from '@/features/feed/components/FiltersScreen'
import { buildGenericTitle } from '@/lib/seo'
import type { FilterPreferences } from '@/features/feed/schemas'

export const metadata = {
  title: buildGenericTitle('Фильтры', 'ru'),
  robots: { index: false, follow: false },
}

export default async function FiltersPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const userId = getUserId((data?.claims ?? {}) as Record<string, unknown>)
  if (!userId) redirect('/auth')

  const { data: viewer } = await supabase
    .from('profiles')
    .select('gender, filter_preferences')
    .eq('id', userId)
    .single()

  const gender: 'male' | 'female' = viewer?.gender === 'female' ? 'female' : 'male'
  const initialFilters = (viewer?.filter_preferences ?? null) as FilterPreferences | null

  return <FiltersScreen viewerGender={gender} initialFilters={initialFilters} />
}
