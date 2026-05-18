import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth/claims'
import { listManualReviewQueue } from '@/features/moderation/server/list-queue'
import { ModerationQueue } from '@/features/moderation/components/ModerationQueue'
import { ScreenBody } from '@/components/layout/AppShell'
import { Icon } from '@/components/ui/icon'
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
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
  const role = profile?.role ?? null
  if (role !== 'moderator' && role !== 'admin') redirect('/feed')

  const queue = await listManualReviewQueue(50)

  return (
    <ScreenBody>
      <div className="flex h-full flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--divider)] bg-[var(--bg)] px-3 py-3">
          <Link
            href="/feed"
            aria-label="Назад"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--ink)]"
          >
            <Icon name="back" size={22} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[22px] font-bold uppercase tracking-[0.5px] text-[var(--ink)]">
              Модерация
            </h1>
          </div>
        </div>

        <div className="scroll-area flex-1 overflow-auto">
          <div className="border-b border-[var(--divider)] px-5 py-3">
            <h2 className="text-sm font-semibold text-[var(--ink-2)]">Очередь модерации</h2>
            <p className="mt-1 text-xs text-[var(--ink-3)]">{queue.length} в ожидании</p>
          </div>
          <ModerationQueue initial={queue} />
        </div>
      </div>
    </ScreenBody>
  )
}
