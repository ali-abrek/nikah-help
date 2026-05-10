'use client'

import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface ChatPreview {
  chat_id: string
  match_id: string
  other_user: {
    id: string
    name: string | null
    photo_url: string | null
  }
  last_message: {
    type: string
    content: string
    sender_id: string
    created_at: string
  } | null
  unread_count: number
  updated_at: string
}

interface ChatListProps {
  chats: ChatPreview[]
  userId: string
}

export function ChatList({ chats, userId }: ChatListProps) {
  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <MessageCircle className="mb-4 h-12 w-12 text-zinc-300" />
        <p className="text-lg font-medium">Нет активных чатов</p>
        <p className="mt-1 text-sm">Здесь появятся чаты с вашими мэтчами</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {chats.map((chat) => (
        <Link
          key={chat.chat_id}
          href={`/chats/${chat.chat_id}`}
          className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
        >
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="h-12 w-12 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
              {chat.other_user.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- streamed via auth-aware route
                <img
                  src={`/api/photos/stream/${chat.other_user.id}/${chat.other_user.photo_url}`}
                  alt={chat.other_user.name ?? ''}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg text-zinc-400">
                  {chat.other_user.name?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground truncate">
                {chat.other_user.name ?? 'Пользователь'}
              </span>
              {chat.last_message && (
                <span className="shrink-0 text-xs text-zinc-400">
                  {formatTime(chat.last_message.created_at)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm text-zinc-500 truncate">
                {chat.last_message ? formatPreview(chat.last_message, userId) : 'Начните общение'}
              </span>
              {chat.unread_count > 0 && (
                <span
                  className={cn(
                    'ml-2 shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white',
                    chat.unread_count > 99 && 'px-1.5',
                  )}
                >
                  {chat.unread_count > 99 ? '99+' : chat.unread_count}
                </span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

function formatPreview(
  msg: { type: string; content: string; sender_id: string },
  userId: string,
): string {
  const prefix = msg.sender_id === userId ? 'Вы: ' : ''
  if (msg.type === 'image') return prefix + '📷 Фото'
  if (msg.type === 'voice') return prefix + '🎤 Голосовое'
  return prefix + (msg.content.length > 60 ? msg.content.slice(0, 60) + '...' : msg.content)
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
