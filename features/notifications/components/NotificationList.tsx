'use client'

import { Bell, CheckCheck } from 'lucide-react'
import { useNotifications } from '@/features/notifications/hooks/useNotifications'
import { NotificationItem } from './NotificationItem'
import type { NotificationWithPayload } from '@/features/notifications/server/get-notifications'

interface NotificationListProps {
  initialNotifications: NotificationWithPayload[]
  userId: string
}

export function NotificationList({ initialNotifications, userId }: NotificationListProps) {
  const { notifications, hasMore, loading, sentinelRef, markAsRead, markAllAsRead } =
    useNotifications({ initialNotifications, userId })

  const hasUnread = notifications.some((n) => n.status === 'unread')

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <Bell className="mb-4 h-12 w-12 text-zinc-300" />
        <p className="text-lg font-medium">Нет уведомлений</p>
        <p className="mt-1 text-sm">
          Здесь будут появляться уведомления о лайках, мэтчах и сообщениях
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Header with "mark all read" */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-sm text-zinc-500">
          {notifications.length} {notifications.length === 1 ? 'уведомление' : 'уведомлений'}
        </span>
        {hasUnread && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <CheckCheck className="h-4 w-4" />
            Прочитать все
          </button>
        )}
      </div>

      {/* List */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onMarkAsRead={markAsRead}
          />
        ))}
      </div>

      {/* Infinite scroll sentinel */}
      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-4">
          {loading && (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
        </div>
      )}
    </div>
  )
}
