'use client'

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils/cn'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Bottom sheet — slides up from the bottom of the device frame. Backdrop
 * click closes; inner content stops propagation. The drag handle is purely
 * visual on web — keyboard/escape closes the sheet.
 */
export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      className="anim-fade fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(15,26,31,0.42)] backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'anim-slide-up w-full max-h-[88%] overflow-auto rounded-t-[22px] bg-[var(--bg)] px-5 pb-[calc(20px+var(--safe-bottom))] pt-3 shadow-[0_-10px_40px_rgba(15,26,31,0.18)]',
          'sm:max-w-[480px]',
          className,
        )}
      >
        <div className="mx-auto mb-3.5 mt-1 h-1 w-9 rounded-full bg-[var(--divider-strong)]" />
        {title && (
          <div className="mb-3 text-[17px] font-semibold tracking-[-0.2px] text-[var(--ink)]">
            {title}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
