'use client'

import { useState } from 'react'
import type { PreferenceMap } from '@/features/notifications/server/get-preferences'

const TYPE_LABELS: Record<string, string> = {
  like_received: 'Лайки',
  like_revoked: 'Отзыв лайка',
  match_created: 'Взаимные симпатии',
  message_new: 'Новые сообщения',
  photo_approved: 'Фото одобрено',
  photo_rejected: 'Фото отклонено',
  photo_removed_by_moderator: 'Фото удалено модератором',
  account_blocked: 'Блокировка аккаунта',
  account_reinstated: 'Восстановление аккаунта',
  account_suspension_expired: 'Окончание блокировки',
  inactivity_warning: 'Напоминания о неактивности',
}

interface Props {
  userId: string
  initialPreferences: PreferenceMap
}

export function NotificationPreferences({ initialPreferences }: Props) {
  const [prefs, setPrefs] = useState(initialPreferences)
  const [saving, setSaving] = useState<string | null>(null)

  const toggle = async (type: string) => {
    const enabled = !prefs[type]
    setPrefs((prev) => ({ ...prev, [type]: enabled }))
    setSaving(type)

    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, enabled }),
      })
      if (!res.ok) {
        // Revert on failure
        setPrefs((prev) => ({ ...prev, [type]: !enabled }))
      }
    } catch {
      setPrefs((prev) => ({ ...prev, [type]: !enabled }))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-1">
      {Object.entries(TYPE_LABELS).map(([type, label]) => (
        <label
          key={type}
          className="flex items-center justify-between py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 px-2 rounded"
        >
          <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
          <button
            role="switch"
            aria-checked={prefs[type]}
            disabled={saving === type}
            onClick={() => toggle(type)}
            className={`
              relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
              transition-colors duration-200 focus:outline-none
              ${prefs[type] ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-600'}
              ${saving === type ? 'opacity-50' : ''}
            `}
          >
            <span
              className={`
                pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow
                transition duration-200
                ${prefs[type] ? 'translate-x-5' : 'translate-x-0'}
              `}
            />
          </button>
        </label>
      ))}
    </div>
  )
}
