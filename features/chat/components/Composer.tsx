'use client'

import { useState, useRef, useCallback } from 'react'
import { Icon } from '@/components/ui/icon'
import { useLang } from '@/lib/i18n/use-lang'
import type { MessageRow } from '../server/get-messages'

interface ComposerProps {
  chatId: string
  quoteMessage: MessageRow | null
  onCancelQuote: () => void
}

export function Composer({ chatId, quoteMessage, onCancelQuote }: ComposerProps) {
  const { t } = useLang()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(async () => {
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    try {
      const formData = new FormData()
      formData.set('chat_id', chatId)
      formData.set('type', 'text')
      formData.set('content', content)
      if (quoteMessage) formData.set('parent_id', quoteMessage.id)

      await fetch('/api/chats/messages', {
        method: 'POST',
        body: formData,
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })

      setText('')
      onCancelQuote()
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

  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [])

  const hasText = text.trim().length > 0

  return (
    <div
      className="border-t border-[var(--divider)] bg-[var(--bg)] px-2.5 py-2"
      style={{ paddingBottom: 'calc(10px + var(--safe-bottom))' }}
    >
      {quoteMessage && !quoteMessage.deleted_at && (
        <div className="mb-2 flex items-center gap-2 border-l-2 border-[var(--primary)] bg-transparent pl-2 pr-2 py-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-semibold text-[var(--primary)]">
              {t('chat_reply')}
            </div>
            <p className="truncate text-[13px] text-[var(--ink-2)]">
              {quoteMessage.type === 'text'
                ? quoteMessage.content.slice(0, 80)
                : quoteMessage.type === 'image'
                  ? '📷 Фото'
                  : '🎙 Голосовое'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelQuote}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-3)]"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <button
          type="button"
          aria-label={t('chat_input_ph')}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--ink-2)]"
        >
          <Icon name="paperclip" size={22} />
        </button>
        <div className="flex flex-1 items-center rounded-[22px] border border-[var(--divider-strong)] bg-[var(--surface)] px-3 py-1.5">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              handleInput()
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('chat_input_ph')}
            rows={1}
            maxLength={4000}
            className="flex-1 resize-none border-none bg-transparent text-[15px] text-[var(--ink)] outline-none [-webkit-tap-highlight-color:transparent]"
          />
        </div>
        <button
          type="button"
          onClick={hasText ? handleSend : undefined}
          aria-label={hasText ? t('send') : t('chat_record')}
          disabled={sending}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white disabled:opacity-50"
        >
          <Icon name={hasText ? 'send' : 'mic'} size={hasText ? 20 : 22} />
        </button>
      </div>
    </div>
  )
}
