'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useInView } from 'react-intersection-observer'
import type { MessageRow } from '../server/get-messages'
import { MessageBubble } from './MessageBubble'

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
  const hasNewMessage = messages.length > prevCountRef.current

  // Scroll to bottom on new messages
  useEffect(() => {
    if (hasNewMessage) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevCountRef.current = messages.length
  }, [messages.length, hasNewMessage])

  // Scroll to bottom on first load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [])

  // Track visible messages for read receipts
  const handleInView = useCallback(
    (messageId: string) => {
      onMarkAsRead([messageId])
    },
    [onMarkAsRead],
  )

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-20 text-zinc-400">
        <p className="text-sm">Напишите первое сообщение</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
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
