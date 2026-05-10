'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MessageRow } from '../server/get-messages'

// Callbacks are kept in refs so callers don't have to memoise them. Without
// this, every parent re-render that passes an inline closure would tear down
// the Realtime channel and rebuild it, dropping in-flight events.
export function useChatChannel(
  chatId: string,
  userId: string,
  onNewMessage: (message: MessageRow) => void,
) {
  const [isOnline, setIsOnline] = useState(false)
  const onNewMessageRef = useRef(onNewMessage)

  useEffect(() => {
    onNewMessageRef.current = onNewMessage
  }, [onNewMessage])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`chat:${chatId}`, {
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
        onNewMessageRef.current(payload.new as MessageRow)
      },
    )

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      setIsOnline(Object.keys(state).length > 1)
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() })
      }
      if (status === 'CHANNEL_ERROR') {
        console.warn('[useChatChannel] Channel error, retrying...')
        setTimeout(() => channel.subscribe(), 2000)
      }
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [chatId, userId])

  return { isOnline }
}

export function useChatUpdates(chatId: string, onUpdate: (message: MessageRow) => void) {
  const onUpdateRef = useRef(onUpdate)
  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`chat:${chatId}:updates`)

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

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        setTimeout(() => channel.subscribe(), 2000)
      }
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [chatId])
}
