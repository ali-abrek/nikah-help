'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

interface ToastCtx {
  show: (message: string) => void
}

const ToastContext = createContext<ToastCtx | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

/**
 * `useSyncExternalStore` returns false on the server and true after hydration.
 * We use it instead of useState+useEffect to satisfy the
 * react-hooks/set-state-in-effect rule — the value flips during commit,
 * not from inside an effect body.
 */
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const mounted = useMounted()

  const show = useCallback((msg: string) => {
    setMessage(msg)
  }, [])

  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(() => setMessage(null), 2200)
    return () => window.clearTimeout(id)
  }, [message])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {mounted &&
        message &&
        createPortal(
          <div className="anim-slide-up pointer-events-none fixed left-4 right-4 z-[80] mx-auto max-w-[480px] bottom-[calc(96px+var(--safe-bottom))]">
            <div className="rounded-xl bg-[var(--ink)] px-4 py-3 text-[13.5px] text-[var(--bg)] shadow-[0_12px_30px_rgba(15,26,31,0.25)]">
              {message}
            </div>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}
