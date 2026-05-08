'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function usePresence(chatId: string, userId: string) {
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`chat:${chatId}:presence`, {
      config: { presence: { key: userId } },
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
        })
      }
      if (status === 'CHANNEL_ERROR') {
        setTimeout(() => channel.subscribe(), 2000)
      }
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [chatId, userId])
}
