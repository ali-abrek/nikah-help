'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { captureSentryException } from '@/lib/sentry/capture'

export function usePresence(chatId: string, userId: string) {
  useEffect(() => {
    const supabase = createClient()
    const channelName = `chat:${chatId}:presence`
    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId } },
    })

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
        })
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        void captureSentryException(new Error(`Presence channel ${status}: ${channelName}`), {
          flow: 'realtime.channel',
          severity: 'warning',
          tags: { channel: channelName, status },
        })
        reconnectTimer = setTimeout(() => channel.subscribe(), 2000)
      }
    })

    return () => {
      clearTimeout(reconnectTimer)
      supabase.removeChannel(channel)
    }
  }, [chatId, userId])
}
