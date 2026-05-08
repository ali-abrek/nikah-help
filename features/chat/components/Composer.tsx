'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Paperclip, Mic } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { MessageRow } from '../server/get-messages'

interface ComposerProps {
  chatId: string
  quoteMessage: MessageRow | null
  onCancelQuote: () => void
}

export function Composer({ chatId, quoteMessage, onCancelQuote }: ComposerProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(async () => {
    const content = text.trim()
    if (!content || sending) return

    setSending(true)
    try {
      // Optimistic update handled by parent via Realtime
      const formData = new FormData()
      formData.set('chat_id', chatId)
      formData.set('type', 'text')
      formData.set('content', content)
      if (quoteMessage) {
        formData.set('parent_id', quoteMessage.id)
      }

      await fetch('/api/chats/messages', {
        method: 'POST',
        body: formData,
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })

      setText('')
      onCancelQuote()
    } catch {
      // Error handled via toast in parent
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }, [text, sending, chatId, quoteMessage, onCancelQuote])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  // Auto-resize textarea
  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [])

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3">
      {/* Quote preview */}
      {quoteMessage && !quoteMessage.deleted_at && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <span className="text-xs text-zinc-500">В ответ на:</span>
            <p className="truncate text-foreground">
              {quoteMessage.type === 'text'
                ? quoteMessage.content.slice(0, 80)
                : quoteMessage.type === 'image'
                  ? '📷 Фото'
                  : '🎤 Голосовое'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelQuote}
            className="shrink-0 text-zinc-400 hover:text-zinc-600"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          type="button"
          className="shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-primary transition-colors"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            handleInput()
          }}
          onKeyDown={handleKeyDown}
          placeholder="Сообщение..."
          rows={1}
          maxLength={4000}
          className={cn(
            'flex-1 resize-none rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-4 py-2.5 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            'placeholder:text-zinc-400',
          )}
        />

        {text.trim() ? (
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className={cn(
              'shrink-0 rounded-lg p-2 text-white bg-primary hover:bg-primary-hover transition-colors',
              sending && 'opacity-50',
            )}
          >
            <Send className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-primary transition-colors"
          >
            <Mic className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  )
}
