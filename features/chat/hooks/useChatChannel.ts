'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { captureSentryException } from '@/lib/sentry/capture'
import type { MessageRow } from '../server/get-messages'

// Reconnect storm detection: if a single channel reconnects ≥3 times within
// 60 s, severity escalates from 'warning' to 'error' (design doc §8.2).
interface ReconnectTracker {
  count: number
  windowStart: number
}

function trackReconnect(ref: ReconnectTracker, channelName: string): void {
  const now = Date.now()
  if (now - ref.windowStart > 60_000) {
    ref.count = 1
    ref.windowStart = now
  } else {
    ref.count += 1
  }

  const severity = ref.count >= 3 ? 'error' : 'warning'
  void captureSentryException(new Error(`Realtime channel reconnect: ${channelName}`), {
    flow: 'realtime.channel',
    severity,
    tags: { channel: channelName, status: 'reconnect' },
    extra: { reconnectCount: ref.count },
  })
}

// Callbacks are kept in refs so callers don't have to memoise them. Without
// this, every parent re-render that passes an inline closure would tear down
// the Realtime channel and rebuild it, dropping in-flight events.
export function useChatChannel(
  chatId: string,
  userId: string,
  onNewMessage: (message: MessageRow) => void,
  onUpdateMessage?: (message: MessageRow) => void,
) {
  const [isOnline, setIsOnline] = useState(false)
  const onNewMessageRef = useRef(onNewMessage)
  const onUpdateMessageRef = useRef(onUpdateMessage)
  const reconnectRef = useRef<ReconnectTracker>({ count: 0, windowStart: 0 })

  useEffect(() => {
    onNewMessageRef.current = onNewMessage
  }, [onNewMessage])

  useEffect(() => {
    onUpdateMessageRef.current = onUpdateMessage
  }, [onUpdateMessage])

  useEffect(() => {
    const supabase = createClient()
    const channelName = `chat:${chatId}`
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
        presence: { key: userId },
      },
    })

    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chatId}`,
      },
      (payload) => {
        onNewMessageRef.current(payload.new as MessageRow)
      },
    )

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chatId}`,
      },
      (payload) => {
        onUpdateMessageRef.current?.(payload.new as MessageRow)
      },
    )

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      setIsOnline(Object.keys(state).length > 1)
    })

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() })
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        trackReconnect(reconnectRef.current, channelName)
        reconnectTimer = setTimeout(() => channel.subscribe(), 2000)
      }
    })

    return () => {
      clearTimeout(reconnectTimer)
      supabase.removeChannel(channel)
    }
  }, [chatId, userId])

  return { isOnline }
}

export function useChatUpdates(chatId: string, onUpdate: (message: MessageRow) => void) {
  const onUpdateRef = useRef(onUpdate)
  const reconnectRef = useRef<ReconnectTracker>({ count: 0, windowStart: 0 })

  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    const supabase = createClient()
    const channelName = `chat:${chatId}:updates`
    const channel = supabase.channel(channelName)

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chatId}`,
      },
      (payload) => {
        onUpdateRef.current(payload.new as MessageRow)
      },
    )

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        trackReconnect(reconnectRef.current, channelName)
        reconnectTimer = setTimeout(() => channel.subscribe(), 2000)
      }
    })

    return () => {
      clearTimeout(reconnectTimer)
      supabase.removeChannel(channel)
    }
  }, [chatId])
}
