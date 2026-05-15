'use client'

import type { ReactNode } from 'react'
import { LangProvider } from '@/lib/i18n/use-lang'
import { ToastProvider } from '@/components/ui/toast'
import { DeviceFrame } from './DeviceFrame'

/**
 * Shared client wrapper for every screen. Sits inside the server-side
 * RootLayout so server components can still render unchanged.
 *
 * Order matters: LangProvider is outermost because Toast messages may need
 * translation in the future; ToastProvider must wrap any screen that calls
 * useToast().
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <LangProvider>
      <ToastProvider>
        <DeviceFrame>{children}</DeviceFrame>
      </ToastProvider>
    </LangProvider>
  )
}

/** Scrollable inner area, used as the body of nearly every screen. */
export function ScreenBody({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`scroll-area relative flex-1 overflow-auto [-webkit-overflow-scrolling:touch] ${className}`}
    >
      {children}
    </div>
  )
}
