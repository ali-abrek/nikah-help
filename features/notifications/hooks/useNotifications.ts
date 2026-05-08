'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useInView } from 'react-intersection-observer'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { NotificationWithPayload } from '@/features/notifications/server/get-notifications'

interface UseNotificationsOptions {
  initialNotifications: NotificationWithPayload[]
  userId: string
}

export function useNotifications({ initialNotifications, userId }: UseNotificationsOptions) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [hasMore, setHasMore] = useState(initialNotifications.length >= 20)
  const [loading, setLoading] = useState(false)
  const last = initialNotifications.at(-1)
  const cursorRef = useRef<string | undefined>(last?.created_at ?? undefined)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const { ref: sentinelRef } = useInView({
    threshold: 0,
    onChange: (inView: boolean) => {
      if (inView && hasMore && !loading) {
        loadMore()
      }
    },
  })

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)

    try {
      const params = new URLSearchParams({ cursor: cursorRef.current ?? '', limit: '20' })
      const res = await fetch(`/api/notifications?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data: NotificationWithPayload[] = await res.json()

      if (data.length < 20) setHasMore(false)
      const lastItem = data.at(-1)
      if (lastItem) {
        cursorRef.current = lastItem.created_at ?? undefined
        setNotifications((prev) => [...prev, ...data])
      }
    } finally {
      setLoading(false)
    }
  }, [loading, hasMore])

  // Realtime subscription for new notifications
  useEffect(() => {
    let cancelled = false

    const setup = async () => {
      const { createClient } = await import('@/lib/supabase/client')

      if (cancelled) return
      const supabase = createClient()

      const channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const newNotif = payload.new as NotificationWithPayload
            setNotifications((prev) => [newNotif, ...prev])
          },
        )
        .subscribe()

      channelRef.current = channel
    }

    setup()

    return () => {
      cancelled = true
      channelRef.current?.unsubscribe()
    }
  }, [userId])

  const markAsRead = useCallback(async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, status: 'read', read_at: new Date().toISOString() } : n)),
    )
    fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_id: notificationId }),
    }).catch(() => {})
  }, [])

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) =>
      prev.map((n) => (n.status === 'unread' ? { ...n, status: 'read', read_at: new Date().toISOString() } : n)),
    )
    fetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {})
  }, [])

  return {
    notifications,
    hasMore,
    loading,
    sentinelRef,
    markAsRead,
    markAllAsRead,
  }
}
