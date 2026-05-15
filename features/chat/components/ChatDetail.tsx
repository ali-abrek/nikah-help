'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Icon } from '@/components/ui/icon'
import { IconBtn } from '@/components/ui/header'
import { Sheet } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'
import { Button } from '@/components/ui/button'
import { useLang } from '@/lib/i18n/use-lang'
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
  const { t } = useLang()
  const router = useRouter()
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages)
  const [quoteMessage, setQuoteMessage] = useState<MessageRow | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportText, setReportText] = useState('')
  const [blockUser, setBlockUser] = useState(false)

  const { isOnline } = useChatChannel(chatInfo.chat_id, userId, (newMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === newMessage.id)) return prev
      return [...prev, newMessage]
    })
  })

  const { isTyping } = useTypingStatus(chatInfo.chat_id, userId)
  usePresence(chatInfo.chat_id, userId)

  const handleMarkAsRead = useCallback(
    async (messageIds: string[]) => {
      const unreadIds = messageIds.filter((id) => {
        const msg = messages.find((m) => m.id === id)
        return msg && msg.sender_id !== userId && msg.status !== 'read'
      })
      if (unreadIds.length === 0) return
      setMessages((prev) =>
        prev.map((m) => (unreadIds.includes(m.id) ? { ...m, status: 'read' as const } : m)),
      )
      try {
        await fetch('/api/chats/messages/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatInfo.chat_id, message_ids: unreadIds }),
        })
      } catch {
        /* revert on next fetch */
      }
    },
    [chatInfo.chat_id, messages, userId],
  )

  const handleQuote = useCallback((m: MessageRow) => setQuoteMessage(m), [])
  const handleEdit = useCallback(() => setQuoteMessage(null), [])
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

  const presenceLine = isTyping
    ? t('chats_typing')
    : isOnline
      ? t('chats_online')
      : t('chats_last_seen', { when: '' })

  return (
    <div className="flex h-full flex-col bg-[var(--chat-bg)]">
      <div className="sticky top-0 z-10 flex min-h-[56px] items-center gap-1.5 border-b border-[var(--divider)] bg-[var(--bg)] px-2 py-1.5">
        <IconBtn icon="back" onClick={() => router.back()} />
        <button
          type="button"
          onClick={() => router.push(`/profile/${chatInfo.other_user.id}`)}
          className="flex flex-1 items-center gap-2.5 bg-transparent px-1 text-left"
        >
          <Avatar
            size={36}
            src={
              chatInfo.other_user.photo_url
                ? `/api/photos/stream/${chatInfo.other_user.id}/${chatInfo.other_user.photo_url}`
                : null
            }
            alt={chatInfo.other_user.name ?? ''}
            online={isOnline}
          />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-[var(--ink)]">
              {chatInfo.other_user.name ?? 'Пользователь'}
            </div>
            <div
              className={`mt-px text-[11.5px] ${
                isTyping
                  ? 'text-[var(--primary)]'
                  : isOnline
                    ? 'text-[var(--success)]'
                    : 'text-[var(--ink-3)]'
              }`}
            >
              {presenceLine}
            </div>
          </div>
        </button>
        <IconBtn icon="more" onClick={() => setShowMenu(true)} />
      </div>

      <MessageList
        messages={messages}
        userId={userId}
        onQuote={handleQuote}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onMarkAsRead={handleMarkAsRead}
      />

      {isTyping && <TypingIndicator name={chatInfo.other_user.name ?? 'Пользователь'} />}

      <Composer
        chatId={chatInfo.chat_id}
        quoteMessage={quoteMessage}
        onCancelQuote={() => setQuoteMessage(null)}
      />

      <Sheet open={showMenu} onClose={() => setShowMenu(false)}>
        <button
          type="button"
          onClick={() => {
            setShowMenu(false)
            setShowReport(true)
          }}
          className="flex h-[50px] w-full items-center gap-3 rounded-xl bg-transparent px-4 text-left text-[15px] text-[var(--danger)]"
        >
          <Icon name="flag" size={20} />
          {t('chat_report')}
        </button>
      </Sheet>

      <Sheet open={showReport} onClose={() => setShowReport(false)} title={t('chat_report_title')}>
        <div className="grid gap-3">
          <Textarea
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder={t('chat_report_hint')}
            rows={4}
          />
          <p className="m-0 text-[12.5px] leading-snug text-[var(--ink-3)]">
            {t('chat_report_mod')}
          </p>
          <div className="flex items-center justify-between border-t border-[var(--divider)] py-3">
            <span className="text-[15px] font-medium">{t('chat_report_block')}</span>
            <Toggle on={blockUser} onChange={setBlockUser} />
          </div>
          <Button kind="danger" full size="lg" onClick={() => setShowReport(false)}>
            {t('chat_report_send')}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
