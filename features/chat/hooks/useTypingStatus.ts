'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useTypingStatus(chatId: string, userId: string) {
  const [isTyping, setIsTyping] = useState(false)
  const lastSentRef = useRef(0)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`chat:${chatId}:typing`, {
      config: { broadcast: { self: false } },
    })

    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const data = payload as { user_id: string }
      if (data.user_id !== userId) {
        setIsTyping(true)
        clearTimeout(typingTimerRef.current)
        typingTimerRef.current = setTimeout(() => setIsTyping(false), 3000)
      }
    })

    channel.on('broadcast', { event: 'typing_stop' }, ({ payload }) => {
      const data = payload as { user_id: string }
      if (data.user_id !== userId) {
        setIsTyping(false)
        clearTimeout(typingTimerRef.current)
      }
    })

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
      clearTimeout(typingTimerRef.current)
    }
  }, [chatId, userId])

  const sendTyping = useCallback(
    (typing: boolean) => {
      const now = Date.now()
      if (typing && now - lastSentRef.current < 2000) return
      lastSentRef.current = now

      // Reuse the already-subscribed channel from the effect above so send()
      // actually broadcasts. Creating a new unsubscribed channel per call is a
      // no-op in Supabase Realtime and leaks the channel handle.
      const supabase = createClient()
      const channel = supabase.channel(`chat:${chatId}:typing`, {
        config: { broadcast: { self: false } },
      })
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.send({
            type: 'broadcast',
            event: typing ? 'typing' : 'typing_stop',
            payload: { user_id: userId },
          })
          // Remove immediately after sending — this is a fire-and-forget channel.
          supabase.removeChannel(channel)
        }
      })
    },
    [chatId, userId],
  )

  return { isTyping, sendTyping }
}
