'use client'

import Link from 'next/link'
import { Heart, MessageCircle, CheckCircle, XCircle, AlertTriangle, Shield, Bell, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { NotificationWithPayload } from '@/features/notifications/server/get-notifications'

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  like_received: Heart,
  like_revoked: EyeOff,
  match_created: Heart,
  message_new: MessageCircle,
  photo_approved: CheckCircle,
  photo_rejected: XCircle,
  photo_removed_by_moderator: Shield,
  account_blocked: AlertTriangle,
  account_reinstated: CheckCircle,
  account_suspension_expired: Bell,
  inactivity_warning: Bell,
}

const TYPE_ICON_COLORS: Record<string, string> = {
  like_received: 'text-red-500 bg-red-50',
  like_revoked: 'text-zinc-400 bg-zinc-100',
  match_created: 'text-pink-500 bg-pink-50',
  message_new: 'text-blue-500 bg-blue-50',
  photo_approved: 'text-green-500 bg-green-50',
  photo_rejected: 'text-red-500 bg-red-50',
  photo_removed_by_moderator: 'text-orange-500 bg-orange-50',
  account_blocked: 'text-red-600 bg-red-50',
  account_reinstated: 'text-green-500 bg-green-50',
  account_suspension_expired: 'text-blue-500 bg-blue-50',
  inactivity_warning: 'text-amber-500 bg-amber-50',
}

interface NotificationItemProps {
  notification: NotificationWithPayload
  onMarkAsRead: (id: string) => void
}

export function NotificationItem({ notification, onMarkAsRead }: NotificationItemProps) {
  const isUnread = notification.status === 'unread'
  const Icon = TYPE_ICONS[notification.type] ?? Bell
  const iconColor = TYPE_ICON_COLORS[notification.type] ?? 'text-zinc-400 bg-zinc-100'
  const payload = notification.payload as Record<string, unknown> | null
  const link = payload?.link as string | undefined

  const handleClick = () => {
    if (isUnread) {
      onMarkAsRead(notification.id)
    }
  }

  const content = (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-colors',
        isUnread && 'bg-primary/5',
      )}
    >
      <div className={cn('shrink-0 rounded-full p-2', iconColor)}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className={cn('text-sm', isUnread ? 'font-semibold' : 'font-medium')}>
            {notification.title_key}
          </span>
          <span className="shrink-0 text-xs text-zinc-400">
            {formatRelativeTime(notification.created_at)}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-zinc-500 line-clamp-2">
          {notification.body_key}
        </p>
      </div>

      {isUnread && (
        <div className="shrink-0 mt-2 h-2 w-2 rounded-full bg-primary" />
      )}
    </div>
  )

  if (link) {
    return (
      <Link href={link} onClick={handleClick} className="block hover:bg-zinc-50 dark:hover:bg-zinc-900">
        {content}
      </Link>
    )
  }

  return (
    <button onClick={handleClick} className="block w-full text-left hover:bg-zinc-50 dark:hover:bg-zinc-900">
      {content}
    </button>
  )
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин`
  if (hours < 24) return `${hours} ч`
  if (days < 7) return `${days} д`
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
