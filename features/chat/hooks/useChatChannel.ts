'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MessageRow } from '../server/get-messages'

interface TypingPayload {
  user_id: string
  is_typing: boolean
}

export function useChatChannel(
  chatId: string,
  userId: string,
  onNewMessage: (message: MessageRow) => void,
) {
  const [isOnline, setIsOnline] = useState(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`chat:${chatId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: userId },
      },
    })

    // Postgres Changes for new messages
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chatId}`,
      },
      (payload) => {
        const newMsg = payload.new as MessageRow
        onNewMessage(newMsg)
      },
    )

    // Postgres Changes for updates (edit/delete/status)
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chatId}`,
      },
      (payload) => {
        const updated = payload.new as MessageRow
        onNewMessage(updated) // parent handles dedup and upsert
      },
    )

    // Presence sync
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      setIsOnline(Object.keys(state).length > 1) // more than just us
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

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [chatId, userId, onNewMessage])

  return { isOnline }
}

export function useChatUpdates(
  chatId: string,
  onUpdate: (message: MessageRow) => void,
) {
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
        onUpdate(payload.new as MessageRow)
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
  }, [chatId, onUpdate])
}
