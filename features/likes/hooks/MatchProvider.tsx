'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { MatchModal } from '@/components/layout/MatchModal'

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

interface MatchContextValue {
  showModal: boolean
  matchData: MatchData
  triggerMatch: (data: MatchData) => void
  closeModal: () => void
}

const MatchContext = createContext<MatchContextValue | null>(null)

export function MatchProvider({ children }: { children: ReactNode }) {
  const [showModal, setShowModal] = useState(false)
  const [matchData, setMatchData] = useState<MatchData>({
    myProfile: null,
    theirProfile: null,
  })

  const triggerMatch = useCallback((data: MatchData) => {
    setMatchData(data)
    setShowModal(true)
  }, [])

  const closeModal = useCallback(() => {
    setShowModal(false)
  }, [])

  return (
    <MatchContext.Provider value={{ showModal, matchData, triggerMatch, closeModal }}>
      {children}
      <MatchModal
        open={showModal}
        onClose={closeModal}
        myProfile={matchData.myProfile}
        theirProfile={matchData.theirProfile}
      />
    </MatchContext.Provider>
  )
}

export function useMatch(): MatchContextValue {
  const ctx = useContext(MatchContext)
  if (!ctx) {
    return {
      showModal: false,
      matchData: { myProfile: null, theirProfile: null },
      triggerMatch: () => {},
      closeModal: () => {},
    }
  }
  return ctx
}
