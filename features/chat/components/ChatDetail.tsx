'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, MoreVertical } from 'lucide-react'
import { toast } from 'sonner'
import type { MessageRow } from '../server/get-messages'
import type { ChatInfo } from '../server/get-chat-info'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import { TypingIndicator } from './TypingIndicator'
import { useChatChannel } from '../hooks/useChatChannel'
import { useTypingStatus } from '../hooks/useTypingStatus'
import { usePresence } from '../hooks/usePresence'

interface ChatDetailProps {
  chatInfo: ChatInfo
  initialMessages: MessageRow[]
  userId: string
}

export function ChatDetail({ chatInfo, initialMessages, userId }: ChatDetailProps) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages)
  const [quoteMessage, setQuoteMessage] = useState<MessageRow | null>(null)

  // Realtime subscription for new messages
  const { isOnline } = useChatChannel(chatInfo.chat_id, userId, (newMessage) => {
    setMessages((prev) => {
      // Dedup
      if (prev.some((m) => m.id === newMessage.id)) return prev
      return [...prev, newMessage]
    })
  })

  // Typing indicator
  const { isTyping } = useTypingStatus(chatInfo.chat_id, userId)
  usePresence(chatInfo.chat_id, userId)

  // Mark messages as read when visible
  const handleMarkAsRead = useCallback(
    async (messageIds: string[]) => {
      const unreadIds = messageIds.filter((id) => {
        const msg = messages.find((m) => m.id === id)
        return msg && msg.sender_id !== userId && msg.status !== 'read'
      })

      if (unreadIds.length === 0) return

      // Optimistic
      setMessages((prev) =>
        prev.map((m) => (unreadIds.includes(m.id) ? { ...m, status: 'read' as const } : m)),
      )

      try {
        await fetch('/api/chats/messages/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatInfo.chat_id,
            message_ids: unreadIds,
          }),
        })
      } catch {
        // Revert on next fetch
      }
    },
    [chatInfo.chat_id, messages, userId],
  )

  const handleQuote = useCallback((message: MessageRow) => {
    setQuoteMessage(message)
  }, [])

  const handleEdit = useCallback((_message: MessageRow) => {
    // Editing UX is composed by Composer when we wire it; nothing to do here yet.
    setQuoteMessage(null)
  }, [])

  const handleDelete = useCallback(async (message: MessageRow) => {
    try {
      await fetch(`/api/chats/messages/${message.id}`, { method: 'DELETE' })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id ? { ...m, deleted_at: new Date().toISOString(), content: '' } : m,
        ),
      )
      toast.success('Сообщение удалено')
    } catch {
      toast.error('Не удалось удалить сообщение')
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm px-4 py-3">
        <Link
          href="/chats"
          className="shrink-0 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* Avatar */}
          <div className="relative h-9 w-9 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
            {chatInfo.other_user.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- streamed via custom auth-aware route, next/image can't fetch with cookies
              <img
                src={`/api/photos/stream/${chatInfo.other_user.id}/${chatInfo.other_user.photo_url}`}
                alt={chatInfo.other_user.name ?? ''}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
                {chatInfo.other_user.name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
            )}
            {isOnline && (
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-zinc-950 bg-green-500" />
            )}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {chatInfo.other_user.name ?? 'Пользователь'}
            </p>
            <p className="text-xs text-zinc-500">
              {isTyping ? 'печатает...' : isOnline ? 'в сети' : 'не в сети'}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="shrink-0 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </header>

      {/* Messages */}
      <MessageList
        messages={messages}
        userId={userId}
        onQuote={handleQuote}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onMarkAsRead={handleMarkAsRead}
      />

      {/* Typing indicator */}
      {isTyping && <TypingIndicator name={chatInfo.other_user.name ?? 'Пользователь'} />}

      {/* Composer */}
      <Composer
        chatId={chatInfo.chat_id}
        quoteMessage={quoteMessage}
        onCancelQuote={() => setQuoteMessage(null)}
      />
    </div>
  )
}
