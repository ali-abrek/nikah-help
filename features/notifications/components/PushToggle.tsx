'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { registerPushSubscription, unsubscribePush } from '@/lib/web-push/register'

interface Props {
  userId: string
}

async function probeExistingSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false
  }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return Boolean(sub)
}

export function PushToggle({ userId }: Props) {
  const queryClient = useQueryClient()
  const [toggling, setToggling] = useState(false)

  const { data: pushEnabled, isPending } = useQuery({
    queryKey: ['push-subscription'],
    queryFn: probeExistingSubscription,
    staleTime: Infinity,
  })

  const toggle = async () => {
    setToggling(true)
    try {
      if (pushEnabled) {
        await unsubscribePush()
        queryClient.setQueryData(['push-subscription'], false)
      } else {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return
        const sub = await registerPushSubscription(userId)
        queryClient.setQueryData(['push-subscription'], Boolean(sub))
      }
    } finally {
      setToggling(false)
    }
  }

  if (isPending) {
    return <div className="h-6 w-11 animate-pulse rounded-full bg-zinc-200" />
  }

  return (
    <div className="flex items-center justify-between px-2">
      <span className="text-sm text-zinc-700 dark:text-zinc-300">
        Получать push-уведомления в браузере
      </span>
      <button
        role="switch"
        aria-checked={Boolean(pushEnabled)}
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
