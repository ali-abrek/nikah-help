import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth/claims'
import { queryFeed } from '@/features/feed/server/query-feed'
import { FeedClient } from '@/features/feed/components/FeedClient'
import { FeedHeader } from '@/features/feed/components/FeedHeader'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = { title: 'Лента — Nikah Help' }

export default async function FeedPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    return <EmptyState icon="user" title="Требуется авторизация" />
  }

  const userId = getUserId(data.claims as Record<string, unknown>)
  if (!userId) {
    return <EmptyState icon="user" title="Требуется авторизация" />
  }

  const { data: viewer } = await supabase
    .from('profiles')
    .select('gender')
    .eq('id', userId)
    .single()

  if (!viewer?.gender) {
    return (
      <div className="px-5 py-16 text-center">
        <p className="text-sm text-[var(--ink-2)]">
          Завершите{' '}
          <Link href="/onboarding" className="text-[var(--primary)] underline">
            регистрацию
          </Link>{' '}
          для доступа к ленте.
        </p>
      </div>
    )
  }

  const viewerGender = viewer.gender as 'male' | 'female'
  const initialData = await queryFeed({
    supabase,
    viewerId: userId,
    viewerGender,
    limit: 12,
  })

  return (
    <>
      <FeedHeader />
      <div className="px-5 pb-24">
        <FeedClient
          viewerGender={viewerGender}
          filters={{ gender: viewerGender }}
          initialData={initialData}
        />
      </div>
    </>
  )
}
