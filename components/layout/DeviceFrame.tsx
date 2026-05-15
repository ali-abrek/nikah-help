'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * DeviceFrame is the outermost shell.
 *
 * - On mobile (<= 480px): full-bleed, no chrome — the user sees only the app.
 * - On larger viewports: the app is centred in a phone-shaped frame against
 *   a dark forest backdrop, matching the design package's "device on stage"
 *   presentation.
 *
 * The frame is the scroll container for screen content; bottom nav and sticky
 * action bars sit inside it.
 */
export function DeviceFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'min-h-svh w-full md:grid md:place-items-center md:p-5',
        'md:[background:radial-gradient(1200px_800px_at_50%_20%,#15201C_0%,#0B100E_70%)]',
      )}
    >
      <div
        className={cn(
          'relative isolate flex h-svh w-full flex-col overflow-hidden bg-[var(--bg)] text-[var(--ink)]',
          'md:h-[880px] md:max-h-[calc(100svh-40px)] md:max-w-[420px] md:rounded-[36px]',
          'md:shadow-[0_30px_80px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.05),inset_0_0_0_1.5px_rgba(255,255,255,0.06)]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
