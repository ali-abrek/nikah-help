import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth/claims'
import { queryFeed, queryGuestFeed } from '@/features/feed/server/query-feed'
import { FeedClient } from '@/features/feed/components/FeedClient'
import { FeedHeader } from '@/features/feed/components/FeedHeader'
import { GuestFeedBanner } from '@/features/feed/components/GuestFeedBanner'
import { GuestFeedClient } from '@/features/feed/components/GuestFeedClient'
import { buildGenericTitle } from '@/lib/seo'
import { CancelRegistrationButton } from '@/features/profile/components/CancelRegistrationButton'

export const metadata = { title: buildGenericTitle('Лента', 'ru') }

export default async function FeedPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    const initialData = await queryGuestFeed({ supabase, limit: 12 })
    return (
      <>
        <GuestFeedBanner />
        <div className="px-5 pb-24 pt-3.5">
          <GuestFeedClient initialData={initialData} />
        </div>
      </>
    )
  }

  const userId = getUserId(data.claims as Record<string, unknown>)
  if (!userId) {
    const initialData = await queryGuestFeed({ supabase, limit: 12 })
    return (
      <>
        <GuestFeedBanner />
        <div className="px-5 pb-24 pt-3.5">
          <GuestFeedClient initialData={initialData} />
        </div>
      </>
    )
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
          для доступа к ленте, либо{' '}
          <CancelRegistrationButton />{' '}
          начатую вами ранее регистрацию.
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
