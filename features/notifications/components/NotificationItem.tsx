'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from '@/components/ui/icon'
import { useLang } from '@/lib/i18n/use-lang'
import type { NotificationWithPayload } from '@/features/notifications/server/get-notifications'

type Tone = 'info' | 'important' | 'warn' | 'error'

const TONES: Record<string, { icon: IconName; tone: Tone }> = {
  like_received: { icon: 'heart', tone: 'info' },
  like_revoked: { icon: 'eye-off', tone: 'info' },
  match_created: { icon: 'heart-fill', tone: 'important' },
  message_new: { icon: 'chat', tone: 'info' },
  photo_approved: { icon: 'check', tone: 'info' },
  photo_rejected: { icon: 'close', tone: 'error' },
  photo_auto_rejected: { icon: 'close', tone: 'error' },
  photo_removed_by_moderator: { icon: 'shield', tone: 'warn' },
  account_blocked: { icon: 'shield', tone: 'error' },
  account_reinstated: { icon: 'check', tone: 'info' },
  account_suspension_expired: { icon: 'bell', tone: 'info' },
  inactivity_warning: { icon: 'bell', tone: 'warn' },
}

const TONE_STYLES: Record<Tone, { bg: string; fg: string }> = {
  info: { bg: 'var(--primary-soft)', fg: 'var(--primary)' },
  important: { bg: '#FFE9D6', fg: '#B05A20' },
  warn: { bg: '#FFF3CC', fg: '#7A5500' },
  error: { bg: '#FBE0DC', fg: 'var(--danger)' },
}

interface NotificationItemProps {
  notification: NotificationWithPayload
  onMarkAsRead: (id: string) => void
}

export function NotificationItem({ notification, onMarkAsRead }: NotificationItemProps) {
  const { t } = useLang()
  const isUnread = notification.status === 'unread'
  const def = TONES[notification.type] ?? { icon: 'bell' as IconName, tone: 'info' as Tone }
  const palette = TONE_STYLES[def.tone]
  const payload = notification.payload as Record<string, unknown> | null
  const link = payload?.link as string | undefined
  const photoId = payload?.photo_id as string | undefined

  // Special-cased title for moderator-driven rejection — the back-end stores
  // template keys, not the resolved string. Other types still render the raw
  // key (placeholder behaviour shared with the rest of the app).
  const title =
    notification.type === 'photo_rejected' || notification.type === 'photo_auto_rejected'
      ? t(notification.type === 'photo_rejected' ? 'notif_photo_rejected_title' : 'notif_photo_auto_rejected_title')
      : notification.title_key

  const showPhotoThumb =
    (notification.type === 'photo_rejected' || notification.type === 'photo_auto_rejected') && !!photoId

  const inner = (
    <div
      className={cn(
        'flex items-start gap-3 border-b border-[var(--divider)] px-5 py-3.5',
        isUnread && 'bg-[var(--primary-faint)]',
      )}
    >
      {showPhotoThumb ? (
        <div className="relative aspect-[4/5] h-[48px] w-[38px] shrink-0 overflow-hidden rounded-[8px] bg-[var(--surface-2)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- owner-only stream, not optimisable */}
          <img
            src={`/api/photos/stream?photoId=${photoId}&variant=avatar&fmt=webp`}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      ) : (
        <div
          className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px]"
          style={{ background: palette.bg, color: palette.fg }}
        >
          <Icon name={def.icon} size={18} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'text-[14px] leading-snug text-[var(--ink)]',
            isUnread ? 'font-medium' : 'font-normal',
          )}
        >
          {title}
        </div>
        {notification.body_key &&
          notification.type !== 'photo_rejected' &&
          notification.type !== 'photo_auto_rejected' && (
          <div className="mt-0.5 line-clamp-2 text-[13px] text-[var(--ink-2)]">
            {notification.body_key}
          </div>
        )}
        <div className="mt-1 text-xs text-[var(--ink-3)]">
          {formatRelativeTime(notification.created_at)}
        </div>
      </div>
      {isUnread && <span className="mt-3.5 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />}
    </div>
  )

  const handleClick = () => {
    if (isUnread) onMarkAsRead(notification.id)
  }

  if (link) {
    return (
      <Link href={link} onClick={handleClick} className="block">
        {inner}
      </Link>
    )
  }
  return (
    <button onClick={handleClick} className="block w-full text-left">
      {inner}
    </button>
  )
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин`
  if (hours < 24) return `${hours} ч`
  if (days < 7) return `${days} д`
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
