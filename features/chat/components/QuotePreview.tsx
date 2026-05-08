'use client'

import type { MessageRow } from '../server/get-messages'

interface QuotePreviewProps {
  message: MessageRow | null
  onCancel: () => void
}

export function QuotePreview({ message, onCancel }: QuotePreviewProps) {
  if (!message) return null

  return (
    <div className="flex items-start gap-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 py-2">
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-zinc-500">
          {message.deleted_at ? 'Ответ на удалённое сообщение' : 'Ответ на сообщение'}
        </span>
        {!message.deleted_at && (
          <p className="truncate text-sm text-foreground">
            {message.type === 'text'
              ? message.content.slice(0, 100)
              : message.type === 'image'
                ? '📷 Фото'
                : '🎤 Голосовое'}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-zinc-600"
        aria-label="Отменить ответ"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
