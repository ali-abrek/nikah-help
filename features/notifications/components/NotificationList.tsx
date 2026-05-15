'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/icon'
import { IconBtn } from '@/components/ui/header'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { useLang } from '@/lib/i18n/use-lang'
import { useNotifications } from '@/features/notifications/hooks/useNotifications'
import { NotificationItem } from './NotificationItem'
import type { NotificationWithPayload } from '@/features/notifications/server/get-notifications'

interface NotificationListProps {
  initialNotifications: NotificationWithPayload[]
  userId: string
}

export function NotificationList({ initialNotifications, userId }: NotificationListProps) {
  const { t } = useLang()
  const router = useRouter()
  const { notifications, hasMore, loading, sentinelRef, markAsRead, markAllAsRead } =
    useNotifications({ initialNotifications, userId })

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex min-h-[56px] items-center justify-between gap-2 border-b border-[var(--divider)] bg-[var(--bg)] px-5 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ink)]"
        >
          <Icon name="back" size={22} />
        </button>
        <h1 className="m-0 flex-1 text-[22px] font-bold uppercase tracking-[0.5px] text-[var(--ink)]">
          {t('notif_title')}
        </h1>
        <Link href="/settings" aria-label={t('settings')}>
          <IconBtn icon="gear" ariaLabel={t('settings')} />
        </Link>
        <button
          type="button"
          onClick={markAllAsRead}
          className="bg-transparent text-[13px] font-medium text-[var(--primary)]"
        >
          {t('notif_mark_all')}
        </button>
      </div>

      <div className="scroll-area flex-1 overflow-auto pb-24">
        {notifications.length === 0 ? (
          <EmptyState icon="bell" title={t('notif_empty')} />
        ) : (
          notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} onMarkAsRead={markAsRead} />
          ))
        )}
        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            {loading && <Spinner size={20} />}
          </div>
        )}
      </div>
    </div>
  )
}
