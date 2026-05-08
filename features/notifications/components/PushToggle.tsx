'use client'

import { useState, useEffect } from 'react'
import { registerPushSubscription, unsubscribePush } from '@/lib/web-push/register'

interface Props {
  userId: string
}

export function PushToggle({ userId }: Props) {
  const [pushEnabled, setPushEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub)
          setLoading(false)
        })
      }).catch(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const toggle = async () => {
    setToggling(true)
    try {
      if (pushEnabled) {
        await unsubscribePush()
        setPushEnabled(false)
      } else {
        await Notification.requestPermission()
        const sub = await registerPushSubscription(userId)
        setPushEnabled(!!sub)
      }
    } finally {
      setToggling(false)
    }
  }

  if (loading) {
    return <div className="h-6 w-11 animate-pulse rounded-full bg-zinc-200" />
  }

  return (
    <div className="flex items-center justify-between px-2">
      <span className="text-sm text-zinc-700 dark:text-zinc-300">
        Получать push-уведомления в браузере
      </span>
      <button
        role="switch"
        aria-checked={pushEnabled}
        disabled={toggling}
        onClick={toggle}
        className={`
          relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
          transition-colors duration-200 focus:outline-none
          ${pushEnabled ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-600'}
          ${toggling ? 'opacity-50' : ''}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow
            transition duration-200
            ${pushEnabled ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  )
}
