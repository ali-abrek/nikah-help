'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface MatchProfile {
  id: string
  name: string | null
  gender: 'male' | 'female' | null
  photos: { variants: Record<string, { avif: string; webp: string }> | null }[]
}

interface MatchData {
  myProfile: MatchProfile | null
  theirProfile: MatchProfile | null
}

export function useMatchListener(userId: string | null) {
  const [showModal, setShowModal] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [matchData, setMatchData] = useState<MatchData>({
    myProfile: null,
    theirProfile: null,
  })

  // Listen for real-time match events
  useEffect(() => {
    if (!userId) return

    const supabase = createClient()
    const channel = supabase.channel(`user:${userId}`)

    channel.on('broadcast', { event: 'match.created' }, ({ payload }) => {
      const data = payload as {
        myProfile: MatchProfile
        theirProfile: MatchProfile
        triggeredBy: string
      }

      setMatchData({
        myProfile: data.myProfile,
        theirProfile: data.theirProfile,
      })

      if (data.triggeredBy === userId) {
        setShowModal(true)
      } else {
        setShowToast(true)
      }
    })

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.warn('[useMatchListener] Realtime channel error, retrying...')
        channel.subscribe()
      }
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  // Programmatic trigger from API response (immediate match detection)
  const triggerMatchModal = useCallback((data: MatchData) => {
    setMatchData(data)
    setShowModal(true)
  }, [])

  const closeModal = useCallback(() => {
    setShowModal(false)
  }, [])

  const dismissToast = useCallback(() => {
    setShowToast(false)
  }, [])

  return {
    showModal,
    showToast,
    matchData,
    triggerMatchModal,
    closeModal,
    dismissToast,
  }
}
