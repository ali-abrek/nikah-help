'use client'

import { Check, CheckCheck, Clock } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { MessageRow } from '../server/get-messages'

interface MessageBubbleProps {
  message: MessageRow
  isOwn: boolean
  onQuote?: (message: MessageRow) => void
  onEdit?: (message: MessageRow) => void
  onDelete?: (message: MessageRow) => void
}

export function MessageBubble({
  message,
  isOwn,
  onQuote,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const isDeleted = !!message.deleted_at
  const isEdited = !!message.edited_at && !message.deleted_at
  const canEdit =
    isOwn &&
    !isDeleted &&
    message.type === 'text' &&
    isWithinEditWindow(message.created_at)

  return (
    <div
      className={cn(
        'group flex gap-2 mb-2',
        isOwn ? 'justify-end' : 'justify-start',
      )}
      onContextMenu={(e) => {
        e.preventDefault()
        // Long-press / right-click context menu
      }}
    >
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2 text-sm',
          isOwn
            ? 'bg-primary text-white rounded-br-md'
            : 'bg-zinc-100 dark:bg-zinc-800 text-foreground rounded-bl-md',
          isDeleted && 'italic opacity-60',
        )}
      >
        {/* Quoted parent message */}
        {message.parent_message && !isDeleted && (
          <div
            className={cn(
              'mb-1 rounded-lg px-2 py-1 text-xs',
              isOwn ? 'bg-white/20' : 'bg-zinc-200 dark:bg-zinc-700',
            )}
          >
            {message.parent_message.deleted_at ? (
              <span className="italic opacity-60">Сообщение удалено</span>
            ) : (
              <>
                <span className="font-medium">
                  {message.parent_message.type === 'text'
                    ? message.parent_message.content.slice(0, 60)
                    : message.parent_message.type === 'image'
                      ? '📷 Фото'
                      : '🎤 Голосовое'}
                </span>
              </>
            )}
          </div>
        )}

        {/* Content */}
        {isDeleted ? (
          <span>Сообщение удалено</span>
        ) : message.type === 'image' ? (
          <img
            src={message.content}
            alt="Photo"
            className="max-h-64 rounded-lg object-cover"
            loading="lazy"
          />
        ) : message.type === 'voice' ? (
          <div className="flex items-center gap-2 py-1">
            <span>🎤 Голосовое сообщение</span>
            <span className="text-xs opacity-60">
              {formatDuration(message.content)}
            </span>
          </div>
        ) : (
          <span className="whitespace-pre-wrap break-words">{message.content}</span>
        )}

        {/* Meta: time + status */}
        <div
          className={cn(
            'mt-1 flex items-center gap-1 text-xs',
            isOwn ? 'text-white/70 justify-end' : 'text-zinc-400',
          )}
        >
          {isEdited && !isDeleted && (
            <span>изм.</span>
          )}
          <span>{formatMessageTime(message.created_at)}</span>
          {isOwn && !isDeleted && (
            <StatusIcon status={message.status} />
          )}
        </div>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'sent':
      return <Check className="h-3 w-3" />
    case 'delivered':
      return <CheckCheck className="h-3 w-3" />
    case 'read':
      return <CheckCheck className="h-3 w-3 text-blue-400" />
    default:
      return <Clock className="h-3 w-3" />
  }
}

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(content: string): string {
  const seconds = parseInt(content, 10)
  if (isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function isWithinEditWindow(createdAt: string): boolean {
  const created = new Date(createdAt).getTime()
  const now = Date.now()
  return now - created < 5 * 60 * 1000 // 5 minutes
}
