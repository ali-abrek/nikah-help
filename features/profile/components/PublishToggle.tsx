'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

interface PublishToggleProps {
  isPublished: boolean
}

export function PublishToggle({ isPublished: initialPublished }: PublishToggleProps) {
  const [isPublished, setIsPublished] = useState(initialPublished)
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleToggle = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/profile/toggle-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.success) {
        setIsPublished(data.is_published)
        setShowConfirm(false)
        router.refresh()
      } else {
        setError(data.error ?? 'Не удалось изменить статус')
        setShowConfirm(false)
      }
    } catch {
      setError('Не удалось изменить статус')
      setShowConfirm(false)
    } finally {
      setLoading(false)
    }
  }, [router])

  return (
    <div>
      <div className="flex items-center gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            {isPublished ? 'Профиль опубликован' : 'Профиль скрыт'}
          </p>
          <p className="text-xs text-zinc-500">
            {isPublished
              ? 'Ваш профиль виден в ленте другим пользователям'
              : 'Ваш профиль не отображается в ленте'}
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => setShowConfirm(true)}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            isPublished
              ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
              : 'bg-primary text-white hover:bg-primary-hover',
          )}
        >
          {loading ? '...' : isPublished ? 'Скрыть' : 'Опубликовать'}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-foreground">
              {isPublished ? 'Скрыть профиль?' : 'Опубликовать профиль?'}
            </h3>
            <p className="mt-2 text-sm text-zinc-500">
              {isPublished
                ? 'Ваш профиль перестанет отображаться в ленте. Вы сможете снова опубликовать его в любой момент.'
                : 'Ваш профиль станет видимым в ленте для других пользователей.'}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleToggle}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium text-white',
                  isPublished ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-primary-hover',
                )}
              >
                {isPublished ? 'Скрыть' : 'Опубликовать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
