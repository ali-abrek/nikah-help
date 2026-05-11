import { createServerSupabase } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth/claims'
import { queryFeed } from '@/features/feed/server/query-feed'
import { FeedClient } from '@/features/feed/components/FeedClient'
import Link from 'next/link'

export const metadata = {
  title: 'Лента — Nikah Help',
}

export default async function FeedPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-500">Требуется авторизация</p>
      </div>
    )
  }

  const userId = getUserId(data.claims as Record<string, unknown>)
  if (!userId) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-500">Требуется авторизация</p>
      </div>
    )
  }

  const { data: viewer } = await supabase
    .from('profiles')
    .select('gender')
    .eq('id', userId)
    .single()

  if (!viewer?.gender) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-500">
          Завершите{' '}
          <Link href="/onboarding" className="underline">
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
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Лента</h1>

      <FeedClient
        viewerGender={viewerGender}
        filters={{ gender: viewerGender }}
        initialData={initialData}
      />
    </div>
  )
}
