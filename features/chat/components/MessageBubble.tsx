'use client'

import { cn } from '@/lib/utils/cn'
import { Icon } from '@/components/ui/icon'
import type { MessageRow } from '../server/get-messages'

interface MessageBubbleProps {
  message: MessageRow
  isOwn: boolean
  onQuote?: (message: MessageRow) => void
  onEdit?: (message: MessageRow) => void
  onDelete?: (message: MessageRow) => void
}

export function MessageBubble({ message, isOwn, onQuote, onEdit, onDelete }: MessageBubbleProps) {
  const isDeleted = !!message.deleted_at
  const isEdited = !!message.edited_at && !message.deleted_at
  const canEdit =
    isOwn && !isDeleted && message.type === 'text' && isWithinEditWindow(message.created_at)

  const openContextMenu = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (isDeleted) return
    if (canEdit && onEdit) onEdit(message)
    else if (onQuote) onQuote(message)
    else if (isOwn && onDelete) onDelete(message)
  }

  return (
    <div
      className={cn('group mb-1.5 flex', isOwn ? 'justify-end' : 'justify-start')}
      onContextMenu={openContextMenu}
    >
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-3 py-2 shadow-[0_1px_1px_rgba(15,26,31,0.04)]',
          isOwn
            ? 'rounded-br-md bg-[var(--bubble-me)] text-[var(--bubble-me-fg)]'
            : 'rounded-bl-md bg-[var(--bubble-them)] text-[var(--ink)]',
          isDeleted && 'italic opacity-60',
        )}
      >
        {message.parent_message && !isDeleted && (
          <div
            className={cn(
              'mb-1 rounded-md border-l-2 px-2 py-1',
              isOwn
                ? 'border-white/60 bg-white/15 text-white/90'
                : 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--ink-2)]',
            )}
          >
            <div className="truncate text-[12px] font-medium">
              {message.parent_message.deleted_at
                ? 'Сообщение удалено'
                : message.parent_message.type === 'text'
                  ? message.parent_message.content.slice(0, 60)
                  : message.parent_message.type === 'image'
                    ? '📷 Фото'
                    : '🎙 Голосовое'}
            </div>
          </div>
        )}

        {isDeleted ? (
          <span>Сообщение удалено</span>
        ) : message.type === 'image' ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={message.content}
            alt="Photo"
            className="max-h-64 rounded-lg object-cover"
            loading="lazy"
          />
        ) : message.type === 'voice' ? (
          <div className="flex items-center gap-2 py-0.5">
            <Icon name="mic" size={16} />
            <span className="text-sm">Голосовое · {formatDuration(message.content)}</span>
          </div>
        ) : (
          <span className="whitespace-pre-wrap break-words text-[14.5px] leading-snug">
            {message.content}
          </span>
        )}

        <div
          className={cn(
            'mt-0.5 flex items-center justify-end gap-1 text-[10.5px]',
            isOwn ? 'text-white/75' : 'text-[var(--ink-3)]',
          )}
        >
          {isEdited && !isDeleted && <span>изм.</span>}
          <span>{formatMessageTime(message.created_at)}</span>
          {isOwn && !isDeleted && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'read') return <Icon name="check2" size={13} className="text-[#9DD6FF]" />
  if (status === 'delivered') return <Icon name="check2" size={13} />
  return <Icon name="check" size={13} />
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
  return Date.now() - created < 5 * 60 * 1000
}
