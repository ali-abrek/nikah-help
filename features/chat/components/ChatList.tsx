'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { TextInput } from '@/components/ui/input'
import { BigHeader, IconBtn } from '@/components/ui/header'
import { Icon } from '@/components/ui/icon'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { useLang } from '@/lib/i18n/use-lang'

interface ChatPreview {
  chat_id: string
  match_id: string
  other_user: {
    id: string
    name: string | null
    photo_id: string | null
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
  const { t } = useLang()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return chats
    const q = search.toLowerCase()
    return chats.filter((c) => {
      if (c.other_user.name?.toLowerCase().includes(q)) return true
      if (c.last_message?.content.toLowerCase().includes(q)) return true
      return false
    })
  }, [chats, search])

  return (
    <div className="flex h-full flex-col">
      <BigHeader
        title={t('chats_title')}
        actions={
          <Link href="/settings" aria-label={t('settings')}>
            <IconBtn icon="gear" ariaLabel={t('settings')} />
          </Link>
        }
      />
      <div className="px-5 pb-2 pt-1">
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('chats_search')}
          icon="search"
        />
      </div>
      <div className="scroll-area flex-1 overflow-auto pb-24">
        {filtered.length === 0 ? (
          <EmptyState icon="chat" title={t('chats_empty')} sub={t('chats_empty_sub')} />
        ) : (
          filtered.map((c) => (
            <Link
              key={c.chat_id}
              href={`/chats/${c.chat_id}`}
              className="flex items-center gap-3 border-b border-[var(--divider)] px-5 py-3"
            >
              <Avatar
                src={
                  c.other_user.photo_id
                    ? `/api/photos/stream?photoId=${c.other_user.photo_id}&variant=avatar&fmt=webp`
                    : null
                }
                alt={c.other_user.name ?? ''}
                size={52}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[15.5px] font-semibold text-[var(--ink)]">
                    {c.other_user.name ?? 'Пользователь'}
                  </span>
                  {c.last_message && (
                    <span
                      className={`shrink-0 text-xs ${
                        c.unread_count > 0
                          ? 'font-semibold text-[var(--primary)]'
                          : 'text-[var(--ink-3)]'
                      }`}
                    >
                      {formatTime(c.last_message.created_at)}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="flex-1 truncate text-[13.5px] text-[var(--ink-2)]">
                    {c.last_message ? (
                      <PreviewText msg={c.last_message} userId={userId} t={t} />
                    ) : (
                      t('chat_input_ph')
                    )}
                  </span>
                  {c.unread_count > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--primary)] px-1.5 text-[11.5px] font-semibold text-white">
                      {c.unread_count > 99 ? '99+' : c.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

function PreviewText({
  msg,
  userId,
  t,
}: {
  msg: { type: string; content: string; sender_id: string }
  userId: string
  t: (k: 'chat_you' | 'chat_voice') => string
}) {
  const isMine = msg.sender_id === userId
  const prefix = isMine ? (
    <span className="inline-flex items-center gap-1">
      <Icon name="check2" size={14} className="text-[var(--ink-3)]" />
      {t('chat_you')}:{' '}
    </span>
  ) : null
  let content: string
  if (msg.type === 'image') content = '📷'
  else if (msg.type === 'voice') content = `🎙 ${t('chat_voice')}`
  else content = msg.content.length > 60 ? msg.content.slice(0, 60) + '…' : msg.content
  return (
    <>
      {prefix}
      {content}
    </>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
