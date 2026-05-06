import { createServerSupabase } from '@/lib/supabase/server'
import { queryFeed } from '@/features/feed/server/query-feed'
import { FeedClient } from '@/features/feed/components/FeedClient'

export const metadata = {
  title: 'Лента — Nikah Help',
}

export default async function FeedPage() {
  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()

  if (!claims) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-500">Требуется авторизация</p>
      </div>
    )
  }

  const userId = (claims as Record<string, unknown>).sub as string

  const { data: viewer } = await supabase
    .from('profiles')
    .select('gender')
    .eq('id', userId)
    .single()

  if (!viewer?.gender) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-500">
          Завершите онбординг для доступа к ленте.
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
