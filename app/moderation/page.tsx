import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth/claims'
import { listManualReviewQueue } from '@/features/moderation/server/list-queue'
import { ModerationQueue } from '@/features/moderation/components/ModerationQueue'
import { ScreenBody } from '@/components/layout/AppShell'
import { buildGenericTitle } from '@/lib/seo'

export const metadata = {
  title: buildGenericTitle('Модерация', 'ru'),
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function ModerationPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims ? getUserId(data.claims as Record<string, unknown>) : null
  if (!userId) redirect('/auth')

  // Non-staff users are redirected to /feed — the route's existence is not leaked
  // since redirect() returns a 307 and doesn't render the page.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  const role = profile?.role ?? null
  if (role !== 'moderator' && role !== 'admin') redirect('/feed')

  const queue = await listManualReviewQueue(50)

  return (
    <ScreenBody>
      <div className="flex h-full flex-col">
        <div className="sticky top-0 z-10 border-b border-[var(--divider)] bg-[var(--bg)] px-5 py-3">
          <h1 className="m-0 text-[18px] font-semibold text-[var(--ink)]">Очередь модерации</h1>
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">{queue.length} в ожидании</p>
        </div>
        <div className="scroll-area flex-1 overflow-auto">
          <ModerationQueue initial={queue} />
        </div>
      </div>
    </ScreenBody>
  )
}
