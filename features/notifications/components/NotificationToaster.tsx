'use client'

import { useEffect, useRef } from 'react'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { useLang } from '@/lib/i18n/use-lang'
import type { TKey } from '@/lib/i18n/dictionary'

// Maps a notification row to a short, user-visible toast string. The
// Notification Center renders the full localized title — this toast is the
// drive-by hint while the user is anywhere else in the app.
const TYPE_KEY: Record<string, TKey> = {
  photo_rejected: 'notif_photo_rejected_title',
  photo_auto_rejected: 'notif_photo_auto_rejected_title',
}

interface NotificationRow {
  id: string
  type: string
  title_key: string | null
}

// App-wide listener for new notifications. Mounted once at the (app) layout
// level so users get a popup toast regardless of which screen they're on,
// not just when they happen to have /notifications open.
export function NotificationToaster() {
  const toast = useToast()
  const { t } = useLang()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabaseRef = useRef<SupabaseClient | null>(null)
  const seenIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    const setup = async () => {
      const supabase = createClient()
      supabaseRef.current = supabase

      const { data } = await supabase.auth.getUser()
      const userId = data.user?.id
      if (cancelled || !userId) return

      const channel = supabase
        .channel(`notifications-toaster:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as NotificationRow
            // Realtime fires once per row but double-mount in dev (StrictMode)
            // can re-trigger this — guard with seen set so toasts don't dupe.
            if (seenIds.current.has(row.id)) return
            seenIds.current.add(row.id)

            const key = TYPE_KEY[row.type]
            const message = key ? t(key) : (row.title_key ?? '')
            if (message) toast.show(message)
          },
        )
        .subscribe()

      channelRef.current = channel
    }

    void setup()

    return () => {
      cancelled = true
      if (channelRef.current && supabaseRef.current) {
        supabaseRef.current.removeChannel(channelRef.current)
      }
      channelRef.current = null
      supabaseRef.current = null
    }
  }, [t, toast])

  return null
}
