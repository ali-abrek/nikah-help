'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useInView } from 'react-intersection-observer'
import type { MessageRow } from '../server/get-messages'
import { MessageBubble } from './MessageBubble'

const READ_FLUSH_MS = 250

interface MessageListProps {
  messages: MessageRow[]
  userId: string
  onQuote?: (message: MessageRow) => void
  onEdit?: (message: MessageRow) => void
  onDelete?: (message: MessageRow) => void
  onMarkAsRead: (messageIds: string[]) => void
}

export function MessageList({
  messages,
  userId,
  onQuote,
  onEdit,
  onDelete,
  onMarkAsRead,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(messages.length)
  const queueRef = useRef<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    const ids = Array.from(queueRef.current)
    queueRef.current.clear()
    if (ids.length > 0) onMarkAsRead(ids)
  }, [onMarkAsRead])

  // Flush on unmount so no IDs are lost.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      flush()
    }
  }, [flush])

  // Scroll to bottom on new messages.
  useEffect(() => {
    const hadGrowth = messages.length > prevCountRef.current
    if (hadGrowth) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevCountRef.current = messages.length
  }, [messages.length])

  // Scroll to bottom on first load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [])

  // Queue message IDs and flush after a short debounce.
  const handleInView = useCallback(
    (messageId: string) => {
      queueRef.current.add(messageId)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flush, READ_FLUSH_MS)
    },
    [flush],
  )

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-20 text-[var(--ink-3)]">
        <p className="text-sm">Напишите первое сообщение</p>
      </div>
    )
  }

  return (
    <div className="scroll-area flex-1 space-y-1 overflow-y-auto bg-[var(--chat-bg)] px-3 py-3">
      {messages.map((msg) => (
        <MessageRowWithObserver
          key={msg.id}
          message={msg}
          isOwn={msg.sender_id === userId}
          onQuote={onQuote}
          onEdit={onEdit}
          onDelete={onDelete}
          onInView={handleInView}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

function MessageRowWithObserver({
  message,
  isOwn,
  onQuote,
  onEdit,
  onDelete,
  onInView,
}: {
  message: MessageRow
  isOwn: boolean
  onQuote?: (msg: MessageRow) => void
  onEdit?: (msg: MessageRow) => void
  onDelete?: (msg: MessageRow) => void
  onInView: (id: string) => void
}) {
  const { ref } = useInView({
    threshold: 0.5,
    triggerOnce: true,
    onChange: (inView) => {
      if (inView && !isOwn && message.status !== 'read' && !message.deleted_at) {
        onInView(message.id)
      }
    },
  })

  return (
    <div ref={ref}>
      <MessageBubble
        message={message}
        isOwn={isOwn}
        onQuote={onQuote}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  )
}
